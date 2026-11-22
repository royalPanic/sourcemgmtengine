//! CRUD for entities — typed, reusable objects (people, organizations,
//! vehicles, nations, governments, etc.) that sit between cases/events and
//! sources. Entities carry user-defined qualities, and each quality may
//! reference one or more sources as provenance, displaying the referenced
//! sources' Admiralty ratings.
//!
//! Entities can be global (available to every container) or tied to a single
//! case or event.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::{command, AppHandle};

use crate::commands::references::propagate_entity_rating;
use crate::database::pool;
use crate::validation::{patch_optional, validate_reliability_quality_value};

const ENTITY_COLUMNS: &str =
    "id, entity_type, name, description, case_id, is_global, created_at, updated_at";

const QUALITY_COLUMNS: &str =
    "id, entity_id, quality_name, quality_type, value_string, value_integer, value_boolean, \
     value_date, value_coordinates, value_address, created_at, updated_at";
const SQLITE_IN_CLAUSE_BATCH_SIZE: usize = 900;

/// The valid quality data types.
pub const QUALITY_TYPES: &[&str] = &[
    "string",
    "boolean",
    "integer",
    "date",
    "coordinates",
    "address",
    "reliability",
];

/// A stored entity.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entity {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub description: Option<String>,
    pub case_id: Option<String>,
    pub is_global: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A stored quality on an entity.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityQuality {
    pub id: String,
    pub entity_id: String,
    pub quality_name: String,
    pub quality_type: String,
    pub value_string: Option<String>,
    pub value_integer: Option<i32>,
    pub value_boolean: Option<bool>,
    pub value_date: Option<String>,
    pub value_coordinates: Option<String>,
    pub value_address: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A quality plus the sources referenced as provenance, with their Admiralty
/// ratings at the time of citation.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityQualityWithRefs {
    #[serde(flatten)]
    pub quality: EntityQuality,
    pub source_refs: Vec<QualitySourceRef>,
}

/// A link between a quality and a source, carrying the source's Admiralty
/// rating at citation time.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QualitySourceRef {
    pub id: String,
    pub quality_id: String,
    pub source_id: String,
    pub source_title: Option<String>,
    pub reliability_code: Option<String>,
    pub credibility_code: Option<i32>,
    pub created_at: String,
}

/// An entity type template.
///
/// Built-in templates are seeded from the JSON files embedded by `build.rs` on
/// first run; after that every template is a row the designer can edit.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityType {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub default_qualities: Vec<EntityTypeQuality>,
    /// Set by the database once seeded. The embedded JSON predates the column,
    /// so it defaults to `false` when deserialising a template file.
    #[serde(default)]
    pub is_builtin: bool,
}

/// A single quality definition within an entity type template.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct EntityTypeQuality {
    pub name: String,
    pub r#type: String,
    pub required: bool,
}

/// The columns every entity type read selects, in a stable order.
const ENTITY_TYPE_COLUMNS: &str = "id, name, description, default_qualities, is_builtin";

/// The maximum length of an entity type id.
const MAX_ENTITY_TYPE_ID_LEN: usize = 64;

fn entity_type_from_row(row: &sqlx::sqlite::SqliteRow) -> Result<EntityType, String> {
    let default_qualities: String = row.get("default_qualities");
    let is_builtin: i64 = row.get("is_builtin");

    Ok(EntityType {
        id: row.get("id"),
        name: row.get("name"),
        description: row.get("description"),
        default_qualities: serde_json::from_str(&default_qualities)
            .map_err(|e| format!("Failed to parse default qualities: {}", e))?,
        is_builtin: is_builtin != 0,
    })
}

/// Serialises a template's default qualities for storage.
pub(crate) fn encode_qualities(qualities: &[EntityTypeQuality]) -> Result<String, String> {
    serde_json::to_string(qualities)
        .map_err(|e| format!("Failed to encode default qualities: {}", e))
}

/// Validates a type id.
///
/// The id is stored on every entity of that type and appears in the designer's
/// JSON export, so it is restricted to a lowercase slug: no whitespace, no
/// separators that would need escaping, and no empty string.
fn validate_type_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Type ID is required".to_string());
    }
    if trimmed.len() > MAX_ENTITY_TYPE_ID_LEN {
        return Err(format!(
            "Type ID must be at most {} characters",
            MAX_ENTITY_TYPE_ID_LEN
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
    {
        return Err(
            "Type ID may only contain lowercase letters, digits, hyphens, and underscores"
                .to_string(),
        );
    }
    Ok(trimmed.to_string())
}

/// Validates a template's display name.
fn validate_type_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Type name is required".to_string());
    }
    Ok(trimmed.to_string())
}

/// Validates a template's default qualities.
///
/// Names must be unique within a template: a quality is addressed by name in
/// the UI, so two entries with the same name would be indistinguishable.
pub(crate) fn validate_default_qualities(qualities: &[EntityTypeQuality]) -> Result<(), String> {
    let mut seen: Vec<String> = Vec::with_capacity(qualities.len());
    let mut has_reliability_quality = false;

    for quality in qualities {
        let name = validate_name(&quality.name)?;
        validate_quality_type(&quality.r#type)?;

        if seen.contains(&name) {
            return Err(format!("Duplicate default quality \"{}\"", name));
        }
        seen.push(name);

        if quality.r#type == "reliability" {
            if has_reliability_quality {
                return Err("An entity type may define at most one reliability quality".to_string());
            }
            has_reliability_quality = true;
        }
    }

    Ok(())
}

/// The built-in templates embedded at compile time by `build.rs`.
pub(crate) fn builtin_entity_types() -> Result<Vec<EntityType>, String> {
    use crate::entity_types::all_entity_type_jsons;

    all_entity_type_jsons()
        .iter()
        .map(|content| {
            let mut parsed: EntityType = serde_json::from_str(content)
                .map_err(|e| format!("Failed to parse entity type template: {}", e))?;
            // The JSON files predate the column; the database is authoritative
            // for this flag once seeded.
            parsed.is_builtin = true;
            Ok(parsed)
        })
        .collect()
}

/// Inserts any built-in template that is not already stored.
///
/// Existing rows are left alone: an operator who edited a built-in type must
/// not have their changes overwritten every time the app starts. The embedded
/// JSON is only a seed.
async fn seed_builtin_entity_types(pool: &sqlx::SqlitePool) -> Result<(), String> {
    for builtin in builtin_entity_types()? {
        let qualities = encode_qualities(&builtin.default_qualities)?;
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT OR IGNORE INTO entity_types \
             (id, name, description, default_qualities, is_builtin, created_at, updated_at) \
             VALUES (?, ?, ?, ?, 1, ?, ?)",
        )
        .bind(&builtin.id)
        .bind(&builtin.name)
        .bind(&builtin.description)
        .bind(&qualities)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to seed entity type \"{}\": {}", builtin.id, e))?;
    }

    Ok(())
}

/// Loads every entity type template, seeding the built-ins on first run.
async fn load_entity_types(app: &AppHandle) -> Result<Vec<EntityType>, String> {
    let pool = pool::pool(app).await?;
    seed_builtin_entity_types(&pool).await?;

    let rows = sqlx::query(&format!(
        "SELECT {} FROM entity_types ORDER BY name COLLATE NOCASE ASC",
        ENTITY_TYPE_COLUMNS
    ))
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get entity types: {}", e))?;

    rows.iter().map(entity_type_from_row).collect()
}

/// Loads and validates the quality definitions used when creating an entity.
async fn entity_type_default_qualities(
    pool: &sqlx::SqlitePool,
    id: &str,
) -> Result<Vec<EntityTypeQuality>, String> {
    let encoded: Option<String> =
        sqlx::query_scalar("SELECT default_qualities FROM entity_types WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to look up entity type: {}", e))?;
    let encoded = encoded.ok_or_else(|| format!("Unknown entity type \"{}\"", id))?;
    let qualities: Vec<EntityTypeQuality> = serde_json::from_str(&encoded)
        .map_err(|e| format!("Failed to parse default qualities for \"{}\": {}", id, e))?;
    validate_default_qualities(&qualities)?;

    Ok(qualities)
}

/// Inserts the blank quality rows that a type template defines for each new entity.
pub(crate) async fn insert_entity_default_qualities(
    connection: &mut sqlx::SqliteConnection,
    entity_id: &str,
    qualities: &[EntityTypeQuality],
    now: &str,
) -> Result<(), String> {
    for quality in qualities {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO entity_qualities \
             (id, entity_id, quality_name, quality_type, value_string, value_integer, \
              value_boolean, value_date, value_coordinates, value_address, created_at, updated_at) \
             VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)",
        )
        .bind(id)
        .bind(entity_id)
        .bind(&quality.name)
        .bind(&quality.r#type)
        .bind(now)
        .bind(now)
        .execute(&mut *connection)
        .await
        .map_err(|e| {
            format!(
                "Failed to create default quality \"{}\": {}",
                quality.name, e
            )
        })?;
    }

    Ok(())
}

/// Fetches one template by id.
async fn fetch_entity_type(app: &AppHandle, id: &str) -> Result<Option<EntityType>, String> {
    let pool = pool::pool(app).await?;
    let row = sqlx::query(&format!(
        "SELECT {} FROM entity_types WHERE id = ?",
        ENTITY_TYPE_COLUMNS
    ))
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get entity type: {}", e))?;

    row.as_ref().map(entity_type_from_row).transpose()
}

/// True when any entity is stored against this type.
///
/// Deleting a type that entities still use would leave them pointing at a
/// template that no longer exists, so the delete is refused instead.
async fn entity_type_is_in_use(pool: &sqlx::SqlitePool, id: &str) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities WHERE entity_type = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to check entity type usage: {}", e))?;

    Ok(count > 0)
}

/// True when the id is already taken by another template.
async fn entity_type_id_exists(
    pool: &sqlx::SqlitePool,
    id: &str,
    exclude_id: Option<&str>,
) -> Result<bool, String> {
    let row: Option<String> = match exclude_id {
        Some(exclude) => {
            sqlx::query_scalar("SELECT id FROM entity_types WHERE id = ? AND id != ?")
                .bind(id)
                .bind(exclude)
                .fetch_optional(pool)
                .await
        }
        None => {
            sqlx::query_scalar("SELECT id FROM entity_types WHERE id = ?")
                .bind(id)
                .fetch_optional(pool)
                .await
        }
    }
    .map_err(|e| format!("Failed to check entity type id: {}", e))?;

    Ok(row.is_some())
}

/// Validates the parts of a template write that need no database.
///
/// Split out from the commands so the rules can be tested directly.
pub(crate) fn validate_entity_type_input(
    id: &str,
    name: &str,
    qualities: &[EntityTypeQuality],
) -> Result<(String, String), String> {
    let id = validate_type_id(id)?;
    let name = validate_type_name(name)?;
    validate_default_qualities(qualities)?;

    Ok((id, name))
}

/// Validates an update, where every field is optional.
///
/// Returns the values to write: the supplied name, or the existing one.
pub(crate) fn validate_entity_type_patch(
    existing: &EntityType,
    name: Option<&str>,
    qualities: Option<&[EntityTypeQuality]>,
) -> Result<(String, Vec<EntityTypeQuality>), String> {
    let next_name = match name {
        Some(n) => validate_type_name(n)?,
        None => existing.name.clone(),
    };

    let next_qualities = match qualities {
        Some(q) => {
            validate_default_qualities(q)?;
            q.to_vec()
        }
        None => existing.default_qualities.clone(),
    };

    Ok((next_name, next_qualities))
}

pub(crate) fn normalize_entity_type_description(
    description: Option<String>,
) -> Option<Option<String>> {
    description.map(|value| {
        let value = value.trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    })
}

/// The error returned when a delete is refused.
///
/// Two rules block a delete, and both are reported the same way so the caller
/// has one message shape to render.
pub(crate) fn entity_type_delete_guard(existing: &EntityType, in_use: bool) -> Option<String> {
    if existing.is_builtin {
        return Some(format!(
            "\"{}\" is a built-in entity type and cannot be deleted",
            existing.name
        ));
    }
    if in_use {
        return Some(format!(
            "\"{}\" is still used by one or more entities and cannot be deleted",
            existing.name
        ));
    }
    None
}

fn entity_from_row(row: sqlx::sqlite::SqliteRow) -> Entity {
    let is_global: i64 = row.get("is_global");
    Entity {
        id: row.get("id"),
        entity_type: row.get("entity_type"),
        name: row.get("name"),
        description: row.get("description"),
        case_id: row.get("case_id"),
        is_global: is_global != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn quality_from_row(row: &sqlx::sqlite::SqliteRow) -> EntityQuality {
    let value_boolean: Option<i64> = row.get("value_boolean");
    EntityQuality {
        id: row.get("id"),
        entity_id: row.get("entity_id"),
        quality_name: row.get("quality_name"),
        quality_type: row.get("quality_type"),
        value_string: row.get("value_string"),
        value_integer: row.get::<Option<i32>, _>("value_integer"),
        value_boolean: value_boolean.map(|v| v != 0),
        value_date: row.get("value_date"),
        value_coordinates: row.get("value_coordinates"),
        value_address: row.get("value_address"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

/// Trims and normalises a name, rejecting one that is only whitespace.
fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Entity name is required".to_string());
    }
    Ok(trimmed.to_string())
}

/// Validates that a quality type is one of the supported types.
fn validate_quality_type(quality_type: &str) -> Result<(), String> {
    if QUALITY_TYPES.contains(&quality_type) {
        Ok(())
    } else {
        Err(format!(
            "Quality type must be one of {:?}, got \"{}\"",
            QUALITY_TYPES, quality_type
        ))
    }
}

// --- Commands ---

#[command]
pub async fn get_entity_types(app: AppHandle) -> Result<Vec<EntityType>, String> {
    load_entity_types(&app).await
}

#[command]
pub async fn create_entity_type(
    app: AppHandle,
    id: String,
    name: String,
    description: Option<String>,
    default_qualities: Option<Vec<EntityTypeQuality>>,
) -> Result<EntityType, String> {
    let qualities = default_qualities.unwrap_or_default();
    let (id, name) = validate_entity_type_input(&id, &name, &qualities)?;

    let pool = pool::pool(&app).await?;

    if entity_type_id_exists(&pool, &id, None).await? {
        return Err(format!("An entity type with ID \"{}\" already exists", id));
    }

    let encoded = encode_qualities(&qualities)?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO entity_types \
         (id, name, description, default_qualities, is_builtin, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&description)
    .bind(&encoded)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create entity type: {}", e))?;

    fetch_entity_type(&app, &id)
        .await?
        .ok_or_else(|| "Entity type not found after create".to_string())
}

#[command]
pub async fn update_entity_type(
    app: AppHandle,
    id: String,
    name: Option<String>,
    description: Option<String>,
    default_qualities: Option<Vec<EntityTypeQuality>>,
) -> Result<EntityType, String> {
    let pool = pool::pool(&app).await?;

    let existing = fetch_entity_type(&app, &id)
        .await?
        .ok_or("Entity type not found".to_string())?;

    // An explicitly empty description clears it; an omitted argument leaves it unchanged.
    let description = normalize_entity_type_description(description);
    let (next_name, next_qualities) =
        validate_entity_type_patch(&existing, name.as_deref(), default_qualities.as_deref())?;

    let mut updates: Vec<&str> = Vec::new();
    if name.is_some() {
        updates.push("name = ?");
    }
    if description.is_some() {
        updates.push("description = ?");
    }
    if default_qualities.is_some() {
        updates.push("default_qualities = ?");
    }

    if updates.is_empty() {
        return Ok(existing);
    }

    updates.push("updated_at = ?");
    let query = format!(
        "UPDATE entity_types SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut statement = sqlx::query(&query);
    if name.is_some() {
        statement = statement.bind(&next_name);
    }
    if description.is_some() {
        statement = statement.bind(description.flatten());
    }
    if default_qualities.is_some() {
        statement = statement.bind(encode_qualities(&next_qualities)?);
    }
    statement
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update entity type: {}", e))?;

    fetch_entity_type(&app, &id)
        .await?
        .ok_or_else(|| "Entity type not found after update".to_string())
}

#[command]
pub async fn delete_entity_type(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    let existing = fetch_entity_type(&app, &id)
        .await?
        .ok_or("Entity type not found".to_string())?;

    // Entities store the type id as plain text, so removing a type that is in
    // use would leave them referencing a template that no longer exists.
    let in_use = entity_type_is_in_use(&pool, &id).await?;

    if let Some(message) = entity_type_delete_guard(&existing, in_use) {
        return Err(message);
    }

    sqlx::query("DELETE FROM entity_types WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete entity type: {}", e))?;

    Ok(())
}

#[command]
pub async fn create_entity(
    app: AppHandle,
    entity_type: String,
    name: String,
    description: Option<String>,
    case_id: Option<String>,
    is_global: bool,
) -> Result<Entity, String> {
    let name = validate_name(&name)?;

    // If not global, a case_id is required.
    if !is_global && case_id.is_none() {
        return Err("A non-global entity must belong to a case or event".to_string());
    }

    // If global, case_id must be None.
    if is_global {
        case_id.as_deref().map_or(Ok(()), |_| {
            Err("A global entity cannot belong to a case".to_string())
        })?;
    }

    let pool = pool::pool(&app).await?;

    // Load the template once so its default qualities are copied into the new
    // entity. Later template edits apply only to entities created afterward.
    let default_qualities = entity_type_default_qualities(&pool, &entity_type).await?;

    // Validate the case exists if provided.
    if let Some(case_id) = &case_id {
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?")
            .bind(case_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Failed to look up container: {}", e))?;
        if exists.is_none() {
            return Err("Container not found".to_string());
        }
    }

    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let mut transaction = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin entity creation: {}", e))?;

    sqlx::query(
        "INSERT INTO entities (id, entity_type, name, description, case_id, is_global, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&entity_type)
    .bind(&name)
    .bind(&description)
    .bind(&case_id)
    .bind(if is_global { 1 } else { 0 })
    .bind(&now)
    .bind(&now)
    .execute(&mut *transaction)
    .await
    .map_err(|e| format!("Failed to create entity: {}", e))?;

    insert_entity_default_qualities(&mut transaction, &id, &default_qualities, &now).await?;
    transaction
        .commit()
        .await
        .map_err(|e| format!("Failed to commit entity creation: {}", e))?;

    Ok(Entity {
        id,
        entity_type,
        name,
        description,
        case_id,
        is_global,
        created_at: now.clone(),
        updated_at: now,
    })
}

async fn fetch_entity(app: &AppHandle, id: &str) -> Result<Option<Entity>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM entities WHERE id = ?", ENTITY_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get entity: {}", e))?;

    Ok(row.map(entity_from_row))
}

async fn fetch_quality(app: &AppHandle, id: &str) -> Result<Option<EntityQuality>, String> {
    let pool = pool::pool(app).await?;
    let query = format!(
        "SELECT {} FROM entity_qualities WHERE id = ?",
        QUALITY_COLUMNS
    );
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get quality: {}", e))?;

    Ok(row.map(|row| quality_from_row(&row)))
}

/// Fetches all source references for a quality, joined with source titles.
async fn fetch_quality_source_refs(
    pool: &sqlx::SqlitePool,
    quality_id: &str,
) -> Result<Vec<QualitySourceRef>, String> {
    let rows = sqlx::query(
        "SELECT qsr.id, qsr.quality_id, qsr.source_id, qsr.reliability_code, qsr.credibility_code, \
         qsr.created_at, s.title AS source_title \
         FROM quality_source_refs qsr \
         LEFT JOIN sources s ON s.id = qsr.source_id \
         WHERE qsr.quality_id = ?",
    )
    .bind(quality_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get quality source refs: {}", e))?;

    Ok(rows.iter().map(quality_source_ref_from_row).collect())
}

fn quality_source_ref_from_row(row: &sqlx::sqlite::SqliteRow) -> QualitySourceRef {
    QualitySourceRef {
        id: row.get("id"),
        quality_id: row.get("quality_id"),
        source_id: row.get("source_id"),
        source_title: row.get::<Option<String>, _>("source_title"),
        reliability_code: row.get("reliability_code"),
        credibility_code: row.get("credibility_code"),
        created_at: row.get("created_at"),
    }
}

/// Loads the source references for many qualities in one query.
///
/// `get_entity_qualities` used to call [`fetch_quality_source_refs`] once per
/// quality, which is one query per quality. Grouping them here reduces the
/// number of round-trips to one query per bounded batch.
async fn fetch_quality_source_refs_for_qualities(
    pool: &sqlx::SqlitePool,
    quality_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<QualitySourceRef>>, String> {
    let mut grouped: std::collections::HashMap<String, Vec<QualitySourceRef>> =
        std::collections::HashMap::new();

    if quality_ids.is_empty() {
        return Ok(grouped);
    }

    for quality_id_batch in quality_ids.chunks(SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let placeholders = crate::commands::references::placeholders(quality_id_batch.len());
        let query = format!(
            "SELECT qsr.id, qsr.quality_id, qsr.source_id, qsr.reliability_code, qsr.credibility_code, \
             qsr.created_at, s.title AS source_title \
             FROM quality_source_refs qsr \
             LEFT JOIN sources s ON s.id = qsr.source_id \
             WHERE qsr.quality_id IN ({placeholders})"
        );

        let mut statement = sqlx::query(&query);
        for id in quality_id_batch {
            statement = statement.bind(id);
        }

        let rows = statement
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to get quality source refs: {}", e))?;

        for row in &rows {
            let reference = quality_source_ref_from_row(row);
            grouped
                .entry(reference.quality_id.clone())
                .or_default()
                .push(reference);
        }
    }

    Ok(grouped)
}

/// Builds the `get_entities` SQL plus its bind parameters.
///
/// A global entity belongs to no container, so filtering by `case_id` alone
/// would hide every global entity. Selecting a container therefore returns the
/// global entities *and* that container's own entities. An explicit
/// `is_global` filter narrows the result further; `true` is container
/// independent, so the `case_id` is ignored in that case.
pub(crate) fn build_entities_query(
    case_id: Option<&str>,
    is_global: Option<bool>,
) -> (String, Vec<String>) {
    let mut query = format!("SELECT {} FROM entities", ENTITY_COLUMNS);
    let mut conditions: Vec<&str> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    match (case_id, is_global) {
        (Some(cid), Some(false)) => {
            conditions.push("is_global = 0 AND case_id = ?");
            params.push(cid.to_string());
        }
        // Globals are visible from every container, so the container does not
        // narrow them.
        (_, Some(true)) => conditions.push("is_global = 1"),
        (Some(cid), None) => {
            conditions.push("(is_global = 1 OR case_id = ?)");
            params.push(cid.to_string());
        }
        (None, Some(false)) => conditions.push("is_global = 0"),
        (None, None) => {}
    }

    if !conditions.is_empty() {
        query.push_str(" WHERE ");
        query.push_str(&conditions.join(" AND "));
    }

    query.push_str(" ORDER BY name COLLATE NOCASE ASC");
    (query, params)
}

// --- Commands ---

#[command]
pub async fn get_entities(
    app: AppHandle,
    case_id: Option<String>,
    is_global: Option<bool>,
) -> Result<Vec<Entity>, String> {
    let pool = pool::pool(&app).await?;

    let (query, params) = build_entities_query(case_id.as_deref(), is_global);
    let mut statement = sqlx::query(&query);
    for param in &params {
        statement = statement.bind(param);
    }

    let rows = statement
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get entities: {}", e))?;

    Ok(rows.into_iter().map(entity_from_row).collect())
}

#[command]
pub async fn get_entity(app: AppHandle, id: String) -> Result<Option<Entity>, String> {
    fetch_entity(&app, &id).await
}

#[command]
pub async fn update_entity(
    app: AppHandle,
    id: String,
    name: Option<String>,
    description: Option<String>,
    case_id: Option<String>,
    is_global: Option<bool>,
) -> Result<Entity, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let existing = fetch_entity(&app, &id)
        .await?
        .ok_or("Entity not found".to_string())?;

    let next_name = match &name {
        Some(n) => Some(validate_name(n)?),
        None => Some(existing.name.clone()),
    };
    let next_description = patch_optional(description.clone());
    let next_case_id = patch_optional(case_id.clone());
    let next_is_global = is_global.unwrap_or(existing.is_global);

    // Validate global/case_id consistency only when either field is being changed.
    if is_global.is_some() || case_id.is_some() {
        if next_is_global && matches!(next_case_id.as_ref(), Some(Some(_))) {
            return Err("A global entity cannot belong to a case".to_string());
        }
        if !next_is_global && !matches!(next_case_id.as_ref(), Some(Some(_))) {
            return Err("A non-global entity must belong to a case or event".to_string());
        }
    }

    // Validate the case exists if provided.
    if let Some(Some(cid)) = &next_case_id {
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?")
            .bind(cid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Failed to look up container: {}", e))?;
        if exists.is_none() {
            return Err("Container not found".to_string());
        }
    }

    let mut updates: Vec<&str> = Vec::new();
    if name.is_some() {
        updates.push("name = ?");
    }
    if description.is_some() {
        updates.push("description = ?");
    }
    if case_id.is_some() {
        updates.push("case_id = ?");
    }
    if is_global.is_some() {
        updates.push("is_global = ?");
    }

    if updates.is_empty() {
        return Ok(existing);
    }

    updates.push("updated_at = ?");
    let query = format!("UPDATE entities SET {} WHERE id = ?", updates.join(", "));

    let mut statement = sqlx::query(&query);
    if let Some(n) = &next_name {
        statement = statement.bind(n);
    }
    if let Some(d) = &next_description {
        statement = statement.bind(d);
    }
    if let Some(cid) = &next_case_id {
        statement = statement.bind(cid);
    }
    if is_global.is_some() {
        statement = statement.bind(if next_is_global { 1 } else { 0 });
    }
    statement
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update entity: {}", e))?;

    fetch_entity(&app, &id)
        .await?
        .ok_or("Entity not found after update".to_string())
}

#[command]
pub async fn delete_entity(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    // Qualities and their source refs cascade via ON DELETE CASCADE.
    sqlx::query("DELETE FROM entities WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete entity: {}", e))?;

    Ok(())
}

// --- Quality commands ---

#[command]
pub async fn create_entity_quality(
    app: AppHandle,
    entity_id: String,
    quality_name: String,
    quality_type: String,
    value_string: Option<String>,
    value_integer: Option<i32>,
    value_boolean: Option<bool>,
    value_date: Option<String>,
    value_coordinates: Option<String>,
    value_address: Option<String>,
) -> Result<EntityQuality, String> {
    let quality_name = validate_name(&quality_name)?;
    validate_quality_type(&quality_type)?;

    // A reliability quality carries an Admiralty code (A-F) in value_string.
    if quality_type == "reliability" {
        if let Some(value) = value_string.as_deref().filter(|value| !value.is_empty()) {
            validate_reliability_quality_value(value)?;
        }
    }

    let pool = pool::pool(&app).await?;

    // Verify the entity exists.
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM entities WHERE id = ?")
        .bind(&entity_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to look up entity: {}", e))?;
    if exists.is_none() {
        return Err("Entity not found".to_string());
    }

    // An entity may have at most one reliability quality — it drives source
    // reliability propagation, so multiple would be ambiguous.
    if quality_type == "reliability" {
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM entity_qualities WHERE entity_id = ? AND quality_type = 'reliability'",
        )
        .bind(&entity_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to check for existing reliability quality: {}", e))?;
        if existing.is_some() {
            return Err("Entity already has a reliability quality".to_string());
        }
    }

    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let value_boolean_int = value_boolean.map(|b| if b { 1 } else { 0 });

    sqlx::query(
        "INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string, \
         value_integer, value_boolean, value_date, value_coordinates, value_address, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&entity_id)
    .bind(&quality_name)
    .bind(&quality_type)
    .bind(&value_string)
    .bind(value_integer)
    .bind(value_boolean_int)
    .bind(&value_date)
    .bind(&value_coordinates)
    .bind(&value_address)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create quality: {}", e))?;

    // If this is a reliability quality, propagate its value to all sources
    // that reference this entity.
    if quality_type == "reliability" {
        propagate_entity_rating(&pool, &entity_id).await?;
    }

    Ok(EntityQuality {
        id,
        entity_id,
        quality_name,
        quality_type,
        value_string,
        value_integer,
        value_boolean,
        value_date,
        value_coordinates,
        value_address,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[command]
pub async fn get_entity_qualities(
    app: AppHandle,
    entity_id: String,
) -> Result<Vec<EntityQualityWithRefs>, String> {
    let pool = pool::pool(&app).await?;

    let rows = sqlx::query(&format!("SELECT {} FROM entity_qualities WHERE entity_id = ? ORDER BY quality_name COLLATE NOCASE ASC", QUALITY_COLUMNS))
        .bind(&entity_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get qualities: {}", e))?;

    let qualities: Vec<EntityQuality> = rows.iter().map(quality_from_row).collect();

    // One query for every quality's provenance rather than one per quality.
    let quality_ids: Vec<String> = qualities.iter().map(|q| q.id.clone()).collect();
    let refs = fetch_quality_source_refs_for_qualities(&pool, &quality_ids).await?;

    Ok(qualities
        .into_iter()
        .map(|quality| EntityQualityWithRefs {
            source_refs: refs.get(&quality.id).cloned().unwrap_or_default(),
            quality,
        })
        .collect())
}

#[command]
pub async fn update_entity_quality(
    app: AppHandle,
    id: String,
    quality_name: Option<String>,
    quality_type: Option<String>,
    value_string: Option<Option<String>>,
    value_integer: Option<Option<i32>>,
    value_boolean: Option<Option<bool>>,
    value_date: Option<Option<String>>,
    value_coordinates: Option<Option<String>>,
    value_address: Option<Option<String>>,
) -> Result<EntityQualityWithRefs, String> {
    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();

    let existing = fetch_quality(&app, &id)
        .await?
        .ok_or("Quality not found".to_string())?;

    let next_name = match &quality_name {
        Some(n) => Some(validate_name(n)?),
        None => Some(existing.quality_name.clone()),
    };
    let next_type = match &quality_type {
        Some(t) => {
            validate_quality_type(t)?;
            t.clone()
        }
        None => existing.quality_type.clone(),
    };

    // A reliability quality carries an Admiralty code (A-F) in value_string.
    if next_type == "reliability" {
        if let Some(Some(val)) = &value_string {
            validate_reliability_quality_value(val)?;
        }

        // An entity may have at most one reliability quality — it drives
        // source reliability propagation, so multiple would be ambiguous.
        // Exclude this quality itself from the check.
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM entity_qualities WHERE entity_id = ? AND quality_type = 'reliability' AND id != ?",
        )
        .bind(&existing.entity_id)
        .bind(&existing.id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to check for existing reliability quality: {}", e))?;
        if existing.is_some() {
            return Err("Entity already has a reliability quality".to_string());
        }
    }

    let mut updates: Vec<&str> = Vec::new();
    if quality_name.is_some() {
        updates.push("quality_name = ?");
    }
    if quality_type.is_some() {
        updates.push("quality_type = ?");
    }
    if value_string.is_some() {
        updates.push("value_string = ?");
    }
    if value_integer.is_some() {
        updates.push("value_integer = ?");
    }
    if value_boolean.is_some() {
        updates.push("value_boolean = ?");
    }
    if value_date.is_some() {
        updates.push("value_date = ?");
    }
    if value_coordinates.is_some() {
        updates.push("value_coordinates = ?");
    }
    if value_address.is_some() {
        updates.push("value_address = ?");
    }

    if updates.is_empty() {
        let source_refs = fetch_quality_source_refs(&pool, &existing.id).await?;
        return Ok(EntityQualityWithRefs {
            quality: existing,
            source_refs,
        });
    }

    updates.push("updated_at = ?");
    let query = format!(
        "UPDATE entity_qualities SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut statement = sqlx::query(&query);
    if let Some(n) = &next_name {
        statement = statement.bind(n);
    }
    if quality_type.is_some() {
        statement = statement.bind(&next_type);
    }
    if let Some(v) = value_string {
        statement = statement.bind(v);
    }
    if let Some(v) = value_integer {
        statement = statement.bind(v);
    }
    if let Some(v) = value_boolean {
        statement = statement.bind(v.map(|b| if b { 1 } else { 0 }));
    }
    if let Some(v) = value_date {
        statement = statement.bind(v);
    }
    if let Some(v) = value_coordinates {
        statement = statement.bind(v);
    }
    if let Some(v) = value_address {
        statement = statement.bind(v);
    }
    statement
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update quality: {}", e))?;

    // If this is a reliability quality, propagate its value to all sources
    // that reference this entity.
    if existing.quality_type == "reliability" || next_type == "reliability" {
        propagate_entity_rating(&pool, &existing.entity_id).await?;
    }

    let updated = fetch_quality(&app, &id)
        .await?
        .ok_or("Quality not found after update".to_string())?;
    let source_refs = fetch_quality_source_refs(&pool, &updated.id).await?;
    Ok(EntityQualityWithRefs {
        quality: updated,
        source_refs,
    })
}

#[command]
pub async fn delete_entity_quality(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;
    delete_entity_quality_from_pool(&pool, &id).await
}

pub(crate) async fn delete_entity_quality_from_pool(
    pool: &sqlx::SqlitePool,
    id: &str,
) -> Result<(), String> {
    let existing: Option<(String, String)> =
        sqlx::query_as("SELECT entity_id, quality_type FROM entity_qualities WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to look up quality: {}", e))?;

    // Source refs cascade via ON DELETE CASCADE.
    sqlx::query("DELETE FROM entity_qualities WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete quality: {}", e))?;

    if let Some((entity_id, quality_type)) = existing {
        if quality_type == "reliability" {
            propagate_entity_rating(pool, &entity_id).await?;
        }
    }

    Ok(())
}

// --- Quality source reference commands ---

#[command]
pub async fn add_quality_source_ref(
    app: AppHandle,
    quality_id: String,
    source_id: String,
    reliability_code: Option<String>,
    credibility_code: Option<i32>,
) -> Result<QualitySourceRef, String> {
    let pool = pool::pool(&app).await?;

    // Verify the quality exists.
    let quality_exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM entity_qualities WHERE id = ?")
            .bind(&quality_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Failed to look up quality: {}", e))?;
    if quality_exists.is_none() {
        return Err("Quality not found".to_string());
    }

    // Verify the source exists and get its title.
    type SourceRatingRow = (String, Option<String>, Option<String>, Option<i32>);
    let source_row: Option<SourceRatingRow> = sqlx::query_as(
        "SELECT id, title, reliability_code, credibility_code FROM sources WHERE id = ?",
    )
    .bind(&source_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to look up source: {}", e))?;

    let (source_title, source_reliability, source_credibility) = source_row
        .map(|(_id, title, rel, cred)| (title, rel, cred))
        .ok_or_else(|| "Source not found".to_string())?;

    // Use the source's current rating if not explicitly provided.
    let reliability = reliability_code.or(source_reliability);
    let credibility = credibility_code.or(source_credibility);

    validate_reliability_patch(&reliability)?;
    validate_credibility_patch(credibility)?;

    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO quality_source_refs (id, quality_id, source_id, reliability_code, credibility_code, created_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&quality_id)
    .bind(&source_id)
    .bind(&reliability)
    .bind(credibility)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to add quality source ref: {}", e))?;

    Ok(QualitySourceRef {
        id,
        quality_id,
        source_id,
        source_title,
        reliability_code: reliability,
        credibility_code: credibility,
        created_at: now,
    })
}

#[command]
pub async fn remove_quality_source_ref(app: AppHandle, id: String) -> Result<(), String> {
    let pool = pool::pool(&app).await?;

    sqlx::query("DELETE FROM quality_source_refs WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to remove quality source ref: {}", e))?;

    Ok(())
}

#[command]
pub async fn get_quality_source_refs(
    app: AppHandle,
    quality_id: String,
) -> Result<Vec<QualitySourceRef>, String> {
    let pool = pool::pool(&app).await?;
    fetch_quality_source_refs(&pool, &quality_id).await
}

/// Validates a reliability patch for quality source refs.
fn validate_reliability_patch(value: &Option<String>) -> Result<(), String> {
    match value.as_deref() {
        None | Some("") => Ok(()),
        Some(code) if crate::validation::is_reliability_code(code) => Ok(()),
        Some(code) => Err(format!("Reliability must be one of A-F, got \"{}\"", code)),
    }
}

/// Validates a credibility patch for quality source refs.
fn validate_credibility_patch(value: Option<i32>) -> Result<(), String> {
    match value {
        None | Some(0) => Ok(()),
        Some(code) if crate::validation::is_credibility_code(code) => Ok(()),
        Some(code) => Err(format!("Credibility must be 1-6, got {}", code)),
    }
}
