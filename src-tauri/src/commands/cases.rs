use tauri::{command, AppHandle};
use sqlx::Row;
use chrono::Utc;

use crate::database::pool;
use crate::models::models::{Case, CaseNote};

async fn fetch_case(app: &AppHandle, id: &str) -> Result<Option<Case>, String> {
    let pool = pool::pool(app).await?;
    let row = sqlx::query(
        "SELECT id, title, description, created_at, updated_at FROM cases WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get case: {}", e))?;

    Ok(row.map(|row| Case {
        id: row.get("id"),
        title: row.get("title"),
        description: row.get("description"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

async fn fetch_case_note(app: &AppHandle, case_id: &str) -> Result<Option<CaseNote>, String> {
    let pool = pool::pool(app).await?;
    let row = sqlx::query(
        "SELECT id, case_id, content, updated_at FROM case_notes WHERE case_id = ?",
    )
    .bind(case_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get case note: {}", e))?;

    Ok(row.map(|row| CaseNote {
        id: row.get("id"),
        case_id: row.get("case_id"),
        content: row.get("content"),
        updated_at: row.get("updated_at"),
    }))
}

#[command]
pub async fn create_case(
    app: AppHandle,
    title: String,
    description: Option<String>,
) -> Result<Case, String> {
    let pool = pool::pool(&app).await?;
    let case = Case::new(title, description);
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO cases (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&case.id)
    .bind(&case.title)
    .bind(&case.description)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create case: {}", e))?;

    let note = CaseNote::new(case.id.clone(), String::new());
    sqlx::query(
        "INSERT INTO case_notes (id, case_id, content, updated_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&note.id)
    .bind(&note.case_id)
    .bind(&note.content)
    .bind(&note.updated_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create case note: {}", e))?;

    Ok(case)
}

#[command]
pub async fn get_cases(app: AppHandle) -> Result<Vec<Case>, String> {
    let pool = pool::pool(&app).await?;
    let rows = sqlx::query(
        "SELECT id, title, description, created_at, updated_at FROM cases ORDER BY updated_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get cases: {}", e))?;

    Ok(rows
        .into_iter()
        .map(|row| Case {
            id: row.get("id"),
            title: row.get("title"),
            description: row.get("description"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
        .collect())
}

#[command]
pub async fn get_case(app: AppHandle, id: String) -> Result<Option<Case>, String> {
    fetch_case(&app, &id).await
}

#[command]
pub async fn update_case(
    app: AppHandle,
    id: String,
    title: Option<String>,
    description: Option<String>,
) -> Result<Case, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let mut updates: Vec<&str> = Vec::new();
    if title.is_some() {
        updates.push("title = ?");
    }
    if description.is_some() {
        updates.push("description = ?");
    }

    if updates.is_empty() {
        return fetch_case(&app, &id).await?.ok_or("Case not found".to_string());
    }

    updates.push("updated_at = ?");
    let query = format!("UPDATE cases SET {} WHERE id = ?", updates.join(", "));

    let mut statement = sqlx::query(&query);
    if let Some(title) = title {
        statement = statement.bind(title);
    }
    if let Some(description) = description {
        statement = statement.bind(description);
    }
    statement
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update case: {}", e))?;

    fetch_case(&app, &id)
        .await?
        .ok_or("Case not found after update".to_string())
}

#[command]
pub async fn delete_case(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    // Delete children explicitly: SQLite only enforces ON DELETE CASCADE when
    // `PRAGMA foreign_keys = ON` is set on the connection.
    sqlx::query(
        "DELETE FROM source_attachments WHERE source_id IN (SELECT id FROM sources WHERE case_id = ?)",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to delete case attachments: {}", e))?;

    sqlx::query("DELETE FROM sources WHERE case_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete case sources: {}", e))?;

    sqlx::query("DELETE FROM case_notes WHERE case_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete case notes: {}", e))?;

    sqlx::query("DELETE FROM cases WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete case: {}", e))?;

    Ok(())
}

#[command]
pub async fn get_case_note(app: AppHandle, case_id: String) -> Result<Option<CaseNote>, String> {
    fetch_case_note(&app, &case_id).await
}

#[command]
pub async fn update_case_note(
    app: AppHandle,
    case_id: String,
    content: String,
) -> Result<CaseNote, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let existing = fetch_case_note(&app, &case_id).await?;

    if let Some(note) = existing {
        sqlx::query("UPDATE case_notes SET content = ?, updated_at = ? WHERE case_id = ?")
            .bind(&content)
            .bind(&now)
            .bind(&case_id)
            .execute(&pool)
            .await
            .map_err(|e| format!("Failed to update case note: {}", e))?;

        Ok(CaseNote {
            id: note.id,
            case_id,
            content,
            updated_at: now,
        })
    } else {
        let note = CaseNote::new(case_id.clone(), content.clone());
        sqlx::query(
            "INSERT INTO case_notes (id, case_id, content, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind(&note.id)
        .bind(&note.case_id)
        .bind(&content)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to create case note: {}", e))?;

        Ok(note)
    }
}
