use tauri::{command, AppHandle};
use sqlx::Row;
use serde_json::Value;
use chrono::Utc;

use crate::database::pool;
use crate::models::models::{Source, SourceAttachment, SourceWithAttachments, SourceType, Stance};
use crate::validation::{
    is_hh_mm, is_iso_date, patch_optional, patch_optional_int, validate_credibility_patch,
    validate_reliability_patch,
};
use crate::commands::entities::get_entity_reliability;
use crate::commands::references::{
    propagate_rating, reference_rating, resolve_reference, validate_reference, ReferenceInput,
};

const SOURCE_COLUMNS: &str = "id, case_id, title, source_type, url, raw_text, reliability_code, credibility_code, stance, reference_source_id, reference_entity_id, source_date, source_time, custom_metadata, created_at, updated_at";

fn source_from_row(row: &sqlx::sqlite::SqliteRow) -> Source {
    let source_type_str: String = row.get("source_type");
    let stance_str: Option<String> = row.get("stance");
    Source {
        id: row.get("id"),
        case_id: row.get("case_id"),
        title: row.get("title"),
        source_type: SourceType::from_db(&source_type_str),
        url: row.get("url"),
        raw_text: row.get("raw_text"),
        reliability_code: row.get("reliability_code"),
        credibility_code: row.get("credibility_code"),
        stance: stance_str.as_deref().and_then(Stance::from_db),
        reference_source_id: row.get("reference_source_id"),
        reference_entity_id: row.get("reference_entity_id"),
        source_date: row.get("source_date"),
        source_time: row.get("source_time"),
        custom_metadata: row.get("custom_metadata"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

async fn fetch_attachments(
    app: &AppHandle,
    source_id: &str,
) -> Result<Vec<SourceAttachment>, String> {
    let pool = pool::pool(app).await?;
    let rows = sqlx::query(
        "SELECT id, source_id, file_name, relative_path, mime_type, file_size, created_at FROM source_attachments WHERE source_id = ?",
    )
    .bind(source_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get attachments: {}", e))?;

    Ok(rows
        .into_iter()
        .map(|row| SourceAttachment {
            id: row.get("id"),
            source_id: row.get("source_id"),
            file_name: row.get("file_name"),
            relative_path: row.get("relative_path"),
            mime_type: row.get("mime_type"),
            file_size: row.get("file_size"),
            created_at: row.get("created_at"),
        })
        .collect())
}

async fn fetch_source(app: &AppHandle, id: &str) -> Result<Option<SourceWithAttachments>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM sources WHERE id = ?", SOURCE_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get source: {}", e))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let source = source_from_row(&row);
    let attachments = fetch_attachments(app, &source.id).await?;
    let reference = resolve_reference(
        &pool,
        source.reference_source_id.as_deref(),
        source.reference_entity_id.as_deref(),
    )
    .await?;

    Ok(Some(SourceWithAttachments { source, attachments, reference }))
}

/// A stance is allowed on any case, since all cases can optionally carry a
/// date/time. Only `None` (no stance) is always valid.
async fn validate_stance(
    _app: &AppHandle,
    _case_id: &str,
    stance: &Option<Stance>,
) -> Result<(), String> {
    if stance.is_none() {
        return Ok(());
    }

    Ok(())
}

/// Rejects a source date/time pair that does not match the expected shape, so
/// bad input never reaches the database. Both fields are optional; a time
/// without a date is meaningless, so it is rejected.
fn validate_source_datetime(
    source_date: &Option<String>,
    source_time: &Option<String>,
) -> Result<(), String> {
    if let Some(date) = source_date {
        if !date.is_empty() && !is_iso_date(date) {
            return Err(format!("Source date must be YYYY-MM-DD, got \"{}\"", date));
        }
    }

    if let Some(time) = source_time {
        if !time.is_empty() && !is_hh_mm(time) {
            return Err(format!("Source time must be HH:MM, got \"{}\"", time));
        }
        if source_date.as_deref().map_or(true, str::is_empty) {
            return Err("A source time requires a source date".to_string());
        }
    }

    Ok(())
}

#[command]
pub async fn create_source(
    app: AppHandle,
    case_id: String,
    title: String,
    source_type: SourceType,
    url: Option<String>,
    raw_text: Option<String>,
    reliability_code: Option<String>,
    credibility_code: Option<i32>,
    stance: Option<Stance>,
    reference_source_id: Option<String>,
    reference_entity_id: Option<String>,
    source_date: Option<String>,
    source_time: Option<String>,
    custom_metadata: Value,
) -> Result<Source, String> {
    validate_stance(&app, &case_id, &stance).await?;

    // Ratings are optional; validate whatever was supplied so bad input is
    // rejected here rather than by the database CHECK constraint.
    validate_reliability_patch(&reliability_code)?;
    validate_credibility_patch(credibility_code)?;
    let reliability_code = reliability_code.filter(|c| !c.trim().is_empty());
    let credibility_code = credibility_code.filter(|c| *c != 0);

    // Empty strings are normalised to NULL so "cleared" and "never set" agree.
    let source_date = source_date.filter(|d| !d.trim().is_empty());
    let source_time = source_time.filter(|t| !t.trim().is_empty());
    validate_source_datetime(&source_date, &source_time)?;

    let pool = pool::pool(&app).await?;
    let reference = ReferenceInput::new(reference_source_id, reference_entity_id.clone());

    let mut source = Source::new(
        case_id,
        title,
        source_type,
        url,
        raw_text,
        reliability_code,
        credibility_code,
        stance,
        reference.source_id.clone(),
        reference.entity_id.clone(),
        source_date,
        source_time,
        custom_metadata,
    );

    // A citing source mirrors its reference's rating. Only a reference to
    // another source also suppresses the stance: that is a duplicate capture of
    // one piece of evidence, whereas an entity can express several viewpoints
    // across different captures.
    if reference.is_set() {
        validate_reference(&pool, &source.case_id, &source.id, &reference)
            .await
            .map_err(|e| e.message().to_string())?;

        // If the reference is an entity, inherit its reliability quality.
        if let Some(entity_id) = &reference.entity_id {
            let entity_reliability = get_entity_reliability(&app, entity_id).await?;
            source.reliability_code = entity_reliability;
        } else {
            let (reliability, credibility) = reference_rating(&pool, &reference).await?;
            source.reliability_code = reliability;
            source.credibility_code = credibility;
        }

        if reference.locks_stance() {
            source.stance = None;
        }
    }

    validate_stance(&app, &source.case_id, &source.stance).await?;

    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"INSERT INTO sources (id, case_id, title, source_type, url, raw_text, reliability_code, credibility_code, stance, reference_source_id, reference_entity_id, source_date, source_time, custom_metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&source.id)
    .bind(&source.case_id)
    .bind(&source.title)
    .bind(source.source_type.as_db())
    .bind(&source.url)
    .bind(&source.raw_text)
    .bind(&source.reliability_code)
    .bind(source.credibility_code)
    .bind(source.stance.as_ref().map(|s| s.as_db()))
    .bind(&source.reference_source_id)
    .bind(&source.reference_entity_id)
    .bind(&source.source_date)
    .bind(&source.source_time)
    .bind(&source.custom_metadata)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create source: {}", e))?;

    Ok(source)
}

#[command]
pub async fn get_sources(
    app: AppHandle,
    case_id: String,
) -> Result<Vec<SourceWithAttachments>, String> {
    let pool = pool::pool(&app).await?;
    let query = format!(
        "SELECT {} FROM sources WHERE case_id = ? ORDER BY created_at DESC",
        SOURCE_COLUMNS
    );
    let rows = sqlx::query(&query)
        .bind(&case_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get sources: {}", e))?;

    let mut sources = Vec::with_capacity(rows.len());
    for row in rows {
        let source = source_from_row(&row);
        let attachments = fetch_attachments(&app, &source.id).await?;
        let reference = resolve_reference(
            &pool,
            source.reference_source_id.as_deref(),
            source.reference_entity_id.as_deref(),
        )
        .await?;
        sources.push(SourceWithAttachments { source, attachments, reference });
    }

    Ok(sources)
}

#[command]
pub async fn get_source(app: AppHandle, id: String) -> Result<Option<SourceWithAttachments>, String> {
    fetch_source(&app, &id).await
}

#[command]
pub async fn update_source(
    app: AppHandle,
    id: String,
    title: Option<String>,
    source_type: Option<SourceType>,
    url: Option<String>,
    raw_text: Option<String>,
    reliability_code: Option<String>,
    credibility_code: Option<i32>,
    stance: Option<Stance>,
    reference_source_id: Option<String>,
    reference_entity_id: Option<String>,
    source_date: Option<String>,
    source_time: Option<String>,
    custom_metadata: Option<Value>,
) -> Result<Source, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let existing = fetch_source(&app, &id)
        .await?
        .ok_or("Source not found".to_string())?;

    // Ratings are optional. An empty string (reliability) or 0 (credibility)
    // means "clear", matching how the create path treats an unrated source.
    validate_reliability_patch(&reliability_code)?;
    validate_credibility_patch(credibility_code)?;
    let mut reliability_code = patch_optional(reliability_code);
    let mut credibility_code = patch_optional_int(credibility_code);

    // `Some` on the outer option means "touch the column"; the inner value is
    // what to store, with `None` meaning NULL.
    let mut stance_patch: Option<Option<Stance>> = stance.map(Some);

    let source_date = patch_optional(source_date);
    let source_time = patch_optional(source_time);

    // Validate against the effective post-update values so a partial update
    // cannot leave a source with a time but no date.
    let effective_date = match &source_date {
        Some(patch) => patch.clone(),
        None => existing.source.source_date.clone(),
    };
    let effective_time = match &source_time {
        Some(patch) => patch.clone(),
        None => existing.source.source_time.clone(),
    };
    validate_source_datetime(&effective_date, &effective_time)?;

    // Reference patch: omitted leaves the stored reference alone, an empty
    // string clears it, anything else sets it.
    let next_reference = ReferenceInput::new(
        match reference_source_id {
            None => existing.source.reference_source_id.clone(),
            Some(value) => non_empty(value),
        },
        match reference_entity_id {
            None => existing.source.reference_entity_id.clone(),
            Some(value) => non_empty(value),
        },
    );
    let reference_changed = next_reference.source_id != existing.source.reference_source_id
        || next_reference.entity_id != existing.source.reference_entity_id;

    if next_reference.is_set() {
        validate_reference(&pool, &existing.source.case_id, &id, &next_reference)
            .await
            .map_err(|e| e.message().to_string())?;

        // Live sync: the citing source always mirrors its reference. A report
        // of a statement does not change the reliability of the source or the
        // credibility of the information, so any supplied rating is ignored.
        if let Some(entity_id) = &next_reference.entity_id {
            let entity_reliability = get_entity_reliability(&app, entity_id).await?;
            reliability_code = Some(entity_reliability);
            credibility_code = None;
        } else {
            let (reliability, credibility) = reference_rating(&pool, &next_reference).await?;
            reliability_code = Some(reliability);
            credibility_code = Some(credibility);
        }

        // Only a reference to another source locks the stance. An entity
        // reference keeps the stance editable.
        if next_reference.locks_stance() {
            stance_patch = Some(None);
        }
    } else if reference_changed {
        // Reference was cleared: source can set its own reliability again.
        // reliability_code and credibility_code keep whatever was patched
        // (or None if not supplied).
    }

    if let Some(Some(stance)) = &stance_patch {
        validate_stance(&app, &existing.source.case_id, &Some(stance.clone())).await?;
    }

    let mut updates: Vec<&str> = Vec::new();
    if title.is_some() {
        updates.push("title = ?");
    }
    if source_type.is_some() {
        updates.push("source_type = ?");
    }
    if url.is_some() {
        updates.push("url = ?");
    }
    if raw_text.is_some() {
        updates.push("raw_text = ?");
    }
    if reliability_code.is_some() {
        updates.push("reliability_code = ?");
    }
    if credibility_code.is_some() {
        updates.push("credibility_code = ?");
    }
    if stance_patch.is_some() {
        updates.push("stance = ?");
    }
    if reference_changed {
        updates.push("reference_source_id = ?");
        updates.push("reference_entity_id = ?");
    }
    if source_date.is_some() {
        updates.push("source_date = ?");
    }
    if source_time.is_some() {
        updates.push("source_time = ?");
    }
    if custom_metadata.is_some() {
        updates.push("custom_metadata = ?");
    }

    if updates.is_empty() {
        return Ok(existing.source);
    }

    let rating_touched = reliability_code.is_some()
        || credibility_code.is_some()
        || reference_changed;

    updates.push("updated_at = ?");
    let query = format!("UPDATE sources SET {} WHERE id = ?", updates.join(", "));

    let mut statement = sqlx::query(&query);
    if let Some(title) = title {
        statement = statement.bind(title);
    }
    if let Some(source_type) = source_type {
        statement = statement.bind(source_type.as_db().to_string());
    }
    if let Some(url) = url {
        statement = statement.bind(url);
    }
    if let Some(raw_text) = raw_text {
        statement = statement.bind(raw_text);
    }
    if let Some(reliability_code) = reliability_code {
        // `None` here is an explicit clear, so bind NULL rather than skipping.
        statement = statement.bind(reliability_code);
    }
    if let Some(credibility_code) = credibility_code {
        statement = statement.bind(credibility_code);
    }
    if let Some(stance) = stance_patch {
        statement = statement.bind(stance.map(|s| s.as_db().to_string()));
    }
    if reference_changed {
        statement = statement.bind(&next_reference.source_id);
        statement = statement.bind(&next_reference.entity_id);
    }
    if let Some(source_date) = source_date {
        statement = statement.bind(source_date);
    }
    if let Some(source_time) = source_time {
        statement = statement.bind(source_time);
    }
    if let Some(custom_metadata) = custom_metadata {
        statement = statement.bind(custom_metadata.to_string());
    }

    statement
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update source: {}", e))?;

    // Any source that cites this one mirrors its rating, so a rating change
    // here has to reach them.
    if rating_touched {
        propagate_rating(&pool, &id, &mut Vec::new()).await?;
    }

    fetch_source(&app, &id)
        .await?
        .map(|s| s.source)
        .ok_or("Source not found after update".to_string())
}

/// Trims a patch value, treating blank as "no value".
fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[command]
pub async fn delete_source(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    // Sources citing this one keep the rating they inherited; only the link is
    // cleared, matching the schema's ON DELETE SET NULL.
    sqlx::query("UPDATE sources SET reference_source_id = NULL WHERE reference_source_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to clear source citations: {}", e))?;

    sqlx::query("DELETE FROM source_attachments WHERE source_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete source attachments: {}", e))?;

    sqlx::query("DELETE FROM sources WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete source: {}", e))?;

    Ok(())
}

#[command]
pub async fn add_source_attachment(
    app: AppHandle,
    source_id: String,
    file_name: String,
    relative_path: String,
    mime_type: Option<String>,
    file_size: Option<i64>,
) -> Result<SourceAttachment, String> {
    let pool = pool::pool(&app).await?;
    let attachment =
        SourceAttachment::new(source_id, file_name, relative_path, mime_type, file_size);

    sqlx::query(
        "INSERT INTO source_attachments (id, source_id, file_name, relative_path, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&attachment.id)
    .bind(&attachment.source_id)
    .bind(&attachment.file_name)
    .bind(&attachment.relative_path)
    .bind(&attachment.mime_type)
    .bind(attachment.file_size)
    .bind(&attachment.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to add attachment: {}", e))?;

    Ok(attachment)
}

#[command]
pub async fn delete_source_attachment(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    sqlx::query("DELETE FROM source_attachments WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete attachment: {}", e))?;

    Ok(())
}