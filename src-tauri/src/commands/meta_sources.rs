//! CRUD for meta sources — the global, reusable entities (people and
//! organisations) that sources report *on*. They live outside any case, so the
//! same news agency is described once and cited from anywhere.
//!
//! Their Admiralty rating is what a citing source inherits, which is why
//! editing one propagates to every citation.

use chrono::Utc;
use serde::Serialize;
use sqlx::Row;
use tauri::{command, AppHandle};

use crate::commands::references::propagate_meta_rating;
use crate::database::pool;
use crate::models::models::{MetaSource, MetaSourceKind};
use crate::validation::{
    patch_optional, patch_optional_int, validate_credibility_patch, validate_reliability_patch,
};

const META_COLUMNS: &str =
    "id, name, kind, description, url, reliability_code, credibility_code, created_at, updated_at";

/// A meta source plus the number of sources citing it, for the manager UI.
#[derive(Serialize)]
pub struct MetaSourceSummary {
    #[serde(flatten)]
    pub source: MetaSource,
    pub citation_count: i64,
}

fn meta_from_row(row: &sqlx::sqlite::SqliteRow) -> MetaSource {
    let kind: String = row.get("kind");
    MetaSource {
        id: row.get("id"),
        name: row.get("name"),
        kind: MetaSourceKind::from_db(&kind),
        description: row.get("description"),
        url: row.get("url"),
        reliability_code: row.get("reliability_code"),
        credibility_code: row.get("credibility_code"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

async fn fetch_meta(app: &AppHandle, id: &str) -> Result<Option<MetaSource>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM meta_sources WHERE id = ?", META_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get meta source: {}", e))?;

    Ok(row.map(|row| meta_from_row(&row)))
}

/// Trims and normalises a name, rejecting one that is only whitespace.
fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Meta source name is required".to_string());
    }
    Ok(trimmed.to_string())
}

#[command]
pub async fn create_meta_source(
    app: AppHandle,
    name: String,
    kind: Option<MetaSourceKind>,
    description: Option<String>,
    url: Option<String>,
    reliability_code: Option<String>,
    credibility_code: Option<i32>,
) -> Result<MetaSource, String> {
    let name = validate_name(&name)?;
    validate_reliability_patch(&reliability_code)?;
    validate_credibility_patch(credibility_code)?;

    let pool = pool::pool(&app).await?;
    let meta = MetaSource::new(
        name,
        kind.unwrap_or(MetaSourceKind::Organization),
        patch_optional(description).flatten(),
        patch_optional(url).flatten(),
        reliability_code.filter(|c| !c.trim().is_empty()),
        credibility_code.filter(|c| *c != 0),
    );

    sqlx::query(
        r#"INSERT INTO meta_sources (id, name, kind, description, url, reliability_code, credibility_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&meta.id)
    .bind(&meta.name)
    .bind(meta.kind.as_db())
    .bind(&meta.description)
    .bind(&meta.url)
    .bind(&meta.reliability_code)
    .bind(meta.credibility_code)
    .bind(&meta.created_at)
    .bind(&meta.updated_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create meta source: {}", e))?;

    Ok(meta)
}

/// Lists meta sources with their citation counts, name-ordered.
///
/// The count comes from a correlated subquery rather than a join so entities
/// with no citations still appear.
#[command]
pub async fn get_meta_sources(app: AppHandle) -> Result<Vec<MetaSourceSummary>, String> {
    let pool = pool::pool(&app).await?;
    let columns = META_COLUMNS
        .split(", ")
        .map(|column| format!("meta_sources.{}", column))
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT {}, (SELECT COUNT(*) FROM sources s WHERE s.reference_meta_source_id = meta_sources.id) AS citation_count \
         FROM meta_sources ORDER BY meta_sources.name COLLATE NOCASE ASC",
        columns
    );

    let rows = sqlx::query(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get meta sources: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| MetaSourceSummary {
            source: meta_from_row(row),
            citation_count: row.get("citation_count"),
        })
        .collect())
}

#[command]
pub async fn update_meta_source(
    app: AppHandle,
    id: String,
    name: Option<String>,
    kind: Option<MetaSourceKind>,
    description: Option<String>,
    url: Option<String>,
    reliability_code: Option<String>,
    credibility_code: Option<i32>,
) -> Result<MetaSource, String> {
    validate_reliability_patch(&reliability_code)?;
    validate_credibility_patch(credibility_code)?;

    let name = match name {
        Some(name) => Some(validate_name(&name)?),
        None => None,
    };
    let description = patch_optional(description);
    let url = patch_optional(url);
    let reliability_patch = patch_optional(reliability_code);
    let credibility_patch = patch_optional_int(credibility_code);
    let rating_touched = reliability_patch.is_some() || credibility_patch.is_some();

    let pool = pool::pool(&app).await?;

    let mut updates: Vec<&str> = Vec::new();
    if name.is_some() {
        updates.push("name = ?");
    }
    if kind.is_some() {
        updates.push("kind = ?");
    }
    if description.is_some() {
        updates.push("description = ?");
    }
    if url.is_some() {
        updates.push("url = ?");
    }
    if reliability_patch.is_some() {
        updates.push("reliability_code = ?");
    }
    if credibility_patch.is_some() {
        updates.push("credibility_code = ?");
    }

    if updates.is_empty() {
        return fetch_meta(&app, &id)
            .await?
            .ok_or_else(|| "Meta source not found".to_string());
    }

    let now = Utc::now().to_rfc3339();
    updates.push("updated_at = ?");
    let query = format!("UPDATE meta_sources SET {} WHERE id = ?", updates.join(", "));

    let mut statement = sqlx::query(&query);
    if let Some(name) = name {
        statement = statement.bind(name);
    }
    if let Some(kind) = kind {
        statement = statement.bind(kind.as_db().to_string());
    }
    if let Some(description) = description {
        statement = statement.bind(description);
    }
    if let Some(url) = url {
        statement = statement.bind(url);
    }
    if let Some(reliability_patch) = reliability_patch {
        statement = statement.bind(reliability_patch);
    }
    if let Some(credibility_patch) = credibility_patch {
        statement = statement.bind(credibility_patch);
    }

    let result = statement
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update meta source: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Meta source not found".to_string());
    }

    // Citing sources mirror this rating, so push the change down to them.
    if rating_touched {
        propagate_meta_rating(&pool, &id).await?;
    }

    fetch_meta(&app, &id)
        .await?
        .ok_or_else(|| "Meta source not found after update".to_string())
}

#[command]
pub async fn delete_meta_source(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    // Citations keep the rating they inherited; only the link is cleared. The
    // schema's ON DELETE SET NULL does this too, but SQLite only honours it
    // when `PRAGMA foreign_keys` is on, so it is done explicitly.
    sqlx::query(
        "UPDATE sources SET reference_meta_source_id = NULL WHERE reference_meta_source_id = ?",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to clear meta source citations: {}", e))?;

    sqlx::query("DELETE FROM meta_sources WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete meta source: {}", e))?;

    Ok(())
}
