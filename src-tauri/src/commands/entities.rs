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

use crate::database::pool;
use crate::commands::references::propagate_entity_rating;
use crate::validation::{patch_optional, validate_reliability_quality_value};

const ENTITY_COLUMNS: &str =
    "id, entity_type, name, description, case_id, is_global, created_at, updated_at";

const QUALITY_COLUMNS: &str =
    "id, entity_id, quality_name, quality_type, value_string, value_integer, value_boolean, \
     value_date, value_coordinates, value_address, created_at, updated_at";

const QUALITY_SOURCE_REF_COLUMNS: &str =
    "id, quality_id, source_id, reliability_code, credibility_code, created_at";

/// The valid quality data types.
pub const QUALITY_TYPES: &[&str] = &["string", "boolean", "integer", "date", "coordinates", "address", "reliability"];

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

/// An entity type template, loaded from a JSON file.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityType {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub default_qualities: Vec<EntityTypeQuality>,
}

/// A single quality definition within an entity type template.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityTypeQuality {
    pub name: String,
    pub r#type: String,
    pub required: bool,
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

fn quality_from_row(row: sqlx::sqlite::SqliteRow) -> EntityQuality {
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

/// Loads all entity type templates embedded at compile time by build.rs.
fn load_entity_types() -> Result<Vec<EntityType>, String> {
    use crate::entity_types::all_entity_type_jsons;

    let mut types = Vec::new();
    for content in all_entity_type_jsons() {
        let parsed: EntityType = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse entity type template: {}", e))?;
        types.push(parsed);
    }

    types.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(types)
}

async fn fetch_entity(app: &AppHandle, id: &str) -> Result<Option<Entity>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM entities WHERE id = ?", ENTITY_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get entity: {}", e))?;

    Ok(row.map(|row| entity_from_row(row)))
}

async fn fetch_quality(app: &AppHandle, id: &str) -> Result<Option<EntityQuality>, String> {
    let pool = pool::pool(app).await?;
    let query = format!("SELECT {} FROM entity_qualities WHERE id = ?", QUALITY_COLUMNS);
    let row = sqlx::query(&query)
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to get quality: {}", e))?;

    Ok(row.map(|row| quality_from_row(row)))
}

/// Returns the Admiralty reliability code (A-F) for an entity, read from its
/// quality of type 'reliability'. Returns None if the entity has no such
/// quality.
pub async fn get_entity_reliability(
    app: &AppHandle,
    entity_id: &str,
) -> Result<Option<String>, String> {
    let pool = pool::pool(app).await?;
    let row: Option<String> = sqlx::query_scalar(
        "SELECT value_string FROM entity_qualities WHERE entity_id = ? AND quality_type = 'reliability'",
    )
    .bind(entity_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to read entity reliability: {}", e))?;

    Ok(row)
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

    Ok(rows
        .into_iter()
        .map(|row| QualitySourceRef {
            id: row.get("id"),
            quality_id: row.get("quality_id"),
            source_id: row.get("source_id"),
            source_title: row.get::<Option<String>, _>("source_title"),
            reliability_code: row.get("reliability_code"),
            credibility_code: row.get("credibility_code"),
            created_at: row.get("created_at"),
        })
        .collect())
}

/// Computes the average Admiralty rating for a quality's source references.
/// Returns `(avg_reliability_letter, avg_credibility_number)` as strings.
pub fn admiralty_average(refs: &[QualitySourceRef]) -> (Option<String>, Option<String>) {
    if refs.is_empty() {
        return (None, None);
    }

    let reliability_scores: Vec<u32> = refs
        .iter()
        .filter_map(|r| r.reliability_code.as_deref())
        .filter_map(|c| match c {
            "A" => Some(1),
            "B" => Some(2),
            "C" => Some(3),
            "D" => Some(4),
            "E" => Some(5),
            "F" => Some(6),
            _ => None,
        })
        .collect();

    let credibility_scores: Vec<i32> = refs
        .iter()
        .filter_map(|r| r.credibility_code)
        .collect();

    let avg_reliability = if reliability_scores.is_empty() {
        None
    } else {
        let avg: f64 = reliability_scores.iter().sum::<u32>() as f64 / reliability_scores.len() as f64;
        let letter = match avg.round() as u32 {
            1 => "A",
            2 => "B",
            3 => "C",
            4 => "D",
            5 => "E",
            _ => "F",
        };
        Some(letter.to_string())
    };

    let avg_credibility = if credibility_scores.is_empty() {
        None
    } else {
        let avg: f64 = credibility_scores.iter().sum::<i32>() as f64 / credibility_scores.len() as f64;
        Some(avg.round().to_string())
    };

    (avg_reliability, avg_credibility)
}

// --- Commands ---

#[command]
pub async fn get_entity_types() -> Result<Vec<EntityType>, String> {
    load_entity_types()
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
        case_id.as_deref().map_or(Ok(()), |_| Err("A global entity cannot belong to a case".to_string()))?;
    }

    // Validate the case exists if provided.
    if let Some(case_id) = &case_id {
        let pool = pool::pool(&app).await?;
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?")
            .bind(case_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Failed to look up container: {}", e))?;
        if exists.is_none() {
            return Err("Container not found".to_string());
        }
    }

    let pool = pool::pool(&app).await?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

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
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create entity: {}", e))?;

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

/// Builds the `get_entities` SQL plus its bind parameters.
///
/// A global entity belongs to no container, so filtering by `case_id` alone
/// would hide every global entity. Selecting a container therefore returns the
/// global entities *and* that container's own entities. An explicit
/// `is_global` filter narrows the result further; `true` is container
/// independent, so the `case_id` is ignored in that case.
pub(crate) fn build_entities_query(case_id: Option<&str>, is_global: Option<bool>) -> (String, Vec<String>) {
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

    Ok(rows
        .into_iter()
        .map(|row| entity_from_row(row))
        .collect())
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
        if next_is_global && next_case_id.as_ref().map_or(false, |c| c.is_some()) {
            return Err("A global entity cannot belong to a case".to_string());
        }
        if !next_is_global && next_case_id.as_ref().map_or(true, |c| c.is_none()) {
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
        let val = value_string.as_deref().unwrap_or("");
        validate_reliability_quality_value(val)?;
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
pub async fn get_entity_qualities(app: AppHandle, entity_id: String) -> Result<Vec<EntityQualityWithRefs>, String> {
    let pool = pool::pool(&app).await?;

    let rows = sqlx::query(&format!("SELECT {} FROM entity_qualities WHERE entity_id = ? ORDER BY quality_name COLLATE NOCASE ASC", QUALITY_COLUMNS))
        .bind(&entity_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get qualities: {}", e))?;

    let mut qualities = Vec::with_capacity(rows.len());
    for row in rows {
        let quality = quality_from_row(row);
        let source_refs = fetch_quality_source_refs(&pool, &quality.id).await?;
        qualities.push(EntityQualityWithRefs { quality, source_refs });
    }

    Ok(qualities)
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
    let query = format!("UPDATE entity_qualities SET {} WHERE id = ?", updates.join(", "));

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
    if next_type == "reliability" {
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

    // Source refs cascade via ON DELETE CASCADE.
    sqlx::query("DELETE FROM entity_qualities WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete quality: {}", e))?;

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
    let quality_exists: Option<String> = sqlx::query_scalar("SELECT id FROM entity_qualities WHERE id = ?")
        .bind(&quality_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to look up quality: {}", e))?;
    if quality_exists.is_none() {
        return Err("Quality not found".to_string());
    }

    // Verify the source exists and get its title.
    let source_row: Option<(String, Option<String>, Option<String>, Option<i32>)> = sqlx::query_as(
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
pub async fn get_quality_source_refs(app: AppHandle, quality_id: String) -> Result<Vec<QualitySourceRef>, String> {
    let pool = pool::pool(&app).await?;
    fetch_quality_source_refs(&pool, &quality_id).await
}

/// Validates a reliability patch for quality source refs.
fn validate_reliability_patch(value: &Option<String>) -> Result<(), String> {
    match value.as_deref() {
        None | Some("") => Ok(()),
        Some(code) if crate::validation::is_reliability_code(code) => Ok(()),
        Some(code) => Err(format!(
            "Reliability must be one of A-F, got \"{}\"",
            code
        )),
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
