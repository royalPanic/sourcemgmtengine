use tauri::{command, AppHandle};
use sqlx::Row;
use chrono::Utc;

use crate::database::pool;
use crate::models::models::{Case, CaseNote, ContainerKind};
use crate::validation::{is_hh_mm, is_iso_date, patch_optional};

const CASE_COLUMNS: &str = "id, title, description, kind, event_date, event_time, created_at, updated_at";

fn case_from_row(row: &sqlx::sqlite::SqliteRow) -> Case {
    let kind: String = row.get("kind");
    Case {
        id: row.get("id"),
        title: row.get("title"),
        description: row.get("description"),
        kind: ContainerKind::from_db(&kind),
        event_date: row.get("event_date"),
        event_time: row.get("event_time"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

async fn fetch_case(app: &AppHandle, id: &str) -> Result<Option<Case>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM cases WHERE id = ?", CASE_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get case: {}", e))?;

    Ok(row.map(|row| case_from_row(&row)))
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

/// Rejects a date/time pair that does not match the expected shape, so bad
/// input never reaches the database.
fn validate_event_fields(
    kind: &ContainerKind,
    event_date: &Option<String>,
    event_time: &Option<String>,
) -> Result<(), String> {
    if let Some(date) = event_date {
        if !date.is_empty() && !is_iso_date(date) {
            return Err(format!("Event date must be YYYY-MM-DD, got \"{}\"", date));
        }
    }

    if let Some(time) = event_time {
        if !time.is_empty() && !is_hh_mm(time) {
            return Err(format!("Event time must be HH:MM, got \"{}\"", time));
        }
    }

    if *kind == ContainerKind::Case {
        if event_date.as_deref().is_some_and(|d| !d.is_empty())
            || event_time.as_deref().is_some_and(|t| !t.is_empty())
        {
            return Err("Only events can have a date or time".to_string());
        }
    }

    Ok(())
}

#[command]
pub async fn create_case(
    app: AppHandle,
    title: String,
    description: Option<String>,
    kind: Option<ContainerKind>,
    event_date: Option<String>,
    event_time: Option<String>,
) -> Result<Case, String> {
    let kind = kind.unwrap_or(ContainerKind::Case);
    // An event may be created before its date is known, so both fields are
    // optional. Empty strings are normalised to NULL.
    let event_date = event_date.filter(|d| !d.trim().is_empty());
    let event_time = event_time.filter(|t| !t.trim().is_empty());
    validate_event_fields(&kind, &event_date, &event_time)?;

    let pool = pool::pool(&app).await?;
    let case = Case::new(title, description, kind, event_date, event_time);
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO cases (id, title, description, kind, event_date, event_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&case.id)
    .bind(&case.title)
    .bind(&case.description)
    .bind(case.kind.as_db())
    .bind(&case.event_date)
    .bind(&case.event_time)
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
    let query = format!(
        "SELECT {} FROM cases ORDER BY updated_at DESC",
        CASE_COLUMNS
    );
    let rows = sqlx::query(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get cases: {}", e))?;

    Ok(rows.iter().map(case_from_row).collect())
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
    event_date: Option<String>,
    event_time: Option<String>,
) -> Result<Case, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let existing = fetch_case(&app, &id)
        .await?
        .ok_or("Case not found".to_string())?;

    let event_date = patch_optional(event_date);
    let event_time = patch_optional(event_time);

    // Validate against the effective post-update values so a partial update
    // cannot leave an event in an inconsistent state.
    let effective_date = match &event_date {
        Some(patch) => patch.clone(),
        None => existing.event_date.clone(),
    };
    let effective_time = match &event_time {
        Some(patch) => patch.clone(),
        None => existing.event_time.clone(),
    };
    validate_event_fields(&existing.kind, &effective_date, &effective_time)?;

    let mut updates: Vec<&str> = Vec::new();
    if title.is_some() {
        updates.push("title = ?");
    }
    if description.is_some() {
        updates.push("description = ?");
    }
    if event_date.is_some() {
        updates.push("event_date = ?");
    }
    if event_time.is_some() {
        updates.push("event_time = ?");
    }

    if updates.is_empty() {
        return Ok(existing);
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
    if let Some(event_date) = event_date {
        statement = statement.bind(event_date);
    }
    if let Some(event_time) = event_time {
        statement = statement.bind(event_time);
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