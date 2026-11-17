//! Source references: a source may cite either a sibling source in the same
//! container or a global entity, to record "this is a report *of* that".
//!
//! Two rules follow from the feature's intent and are enforced here rather
//! than in the UI alone:
//!
//! 1. **Ratings are inherited.** A report of a statement does not change the
//!    reliability of the source or the credibility of the information, so the
//!    citing source mirrors its reference's rating. The mirror is kept live:
//!    editing the reference pushes the new rating down every citation.
//! 2. **Stance is suppressed.** Ten outlets repeating one core source must not
//!    look like ten independent corroborations, so a citing source carries no
//!    stance and contributes nothing to the event dashboard.

use chrono::Utc;
use sqlx::sqlite::SqlitePool;
use sqlx::Row;

use crate::models::models::{ReferenceKind, SourceReference};

const SQLITE_IN_CLAUSE_BATCH_SIZE: usize = 900;

/// Why a proposed reference was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum ReferenceError {
    /// Neither id was supplied; the source cites nothing.
    None,
    /// Both ids were supplied. A source cites one thing.
    Ambiguous,
    /// The referenced source does not exist.
    SourceMissing,
    /// The referenced entity does not exist.
    EntityMissing,
    /// The referenced source belongs to a different case or event.
    CrossContainer,
    /// The source would cite itself.
    SelfReference,
    /// Following the chain returns to the starting source.
    Cycle,
}

impl ReferenceError {
    pub fn message(&self) -> &'static str {
        match self {
            ReferenceError::None => "",
            ReferenceError::Ambiguous => "A source may reference a source or an entity, not both",
            ReferenceError::SourceMissing => "Referenced source not found",
            ReferenceError::EntityMissing => "Referenced entity not found",
            ReferenceError::CrossContainer => {
                "A source can only reference another source in the same case or event"
            }
            ReferenceError::SelfReference => "A source cannot reference itself",
            ReferenceError::Cycle => "Reference chain would form a cycle",
        }
    }
}

/// A reference as supplied by the caller, before validation.
#[derive(Debug, Default, Clone)]
pub struct ReferenceInput {
    pub source_id: Option<String>,
    pub entity_id: Option<String>,
}

impl ReferenceInput {
    /// Normalises blank strings to "not set", since the frontend sends `""`
    /// for the "no reference" option.
    pub fn new(source_id: Option<String>, entity_id: Option<String>) -> Self {
        Self {
            source_id: source_id.filter(|id| !id.trim().is_empty()),
            entity_id: entity_id.filter(|id| !id.trim().is_empty()),
        }
    }

    pub fn is_set(&self) -> bool {
        self.source_id.is_some() || self.entity_id.is_some()
    }

    /// True when the reference is to another source rather than an entity.
    ///
    /// The distinction drives the stance rule: a sibling capture is a duplicate
    /// of one piece of evidence, so it must not carry a stance, whereas an
    /// entity may express several viewpoints across different captures.
    pub fn locks_stance(&self) -> bool {
        self.source_id.is_some()
    }
}

/// Walks the reference chain from `source_id` looking for `needle`.
///
/// Iterative rather than recursive so a long (or maliciously deep) chain
/// cannot overflow the stack; the visited set also bounds the work when the
/// data already contains a cycle.
pub async fn chain_contains(
    pool: &SqlitePool,
    source_id: &str,
    needle: &str,
) -> Result<bool, String> {
    let mut current = source_id.to_string();
    let mut visited: Vec<String> = Vec::new();

    loop {
        if current == needle {
            return Ok(true);
        }
        if visited.contains(&current) {
            return Ok(false);
        }
        visited.push(current.clone());

        let next: Option<Option<String>> =
            sqlx::query_scalar("SELECT reference_source_id FROM sources WHERE id = ?")
                .bind(&current)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Failed to walk reference chain: {}", e))?;

        match next.flatten() {
            Some(id) => current = id,
            None => return Ok(false),
        }
    }
}

/// Validates a proposed reference for `source_id` (which may be a source that
/// does not exist yet, as long as no source reference is requested).
///
/// Database failures are surfaced as the closest structural error rather than
/// a separate variant: from the caller's point of view a reference that cannot
/// be resolved is one that cannot be used.
pub async fn validate_reference(
    pool: &SqlitePool,
    case_id: &str,
    source_id: &str,
    input: &ReferenceInput,
) -> Result<(), ReferenceError> {
    match (&input.source_id, &input.entity_id) {
        (None, None) => Err(ReferenceError::None),
        (Some(_), Some(_)) => Err(ReferenceError::Ambiguous),
        (Some(reference_id), None) => {
            if reference_id == source_id {
                return Err(ReferenceError::SelfReference);
            }

            let target_case: Option<String> =
                sqlx::query_scalar("SELECT case_id FROM sources WHERE id = ?")
                    .bind(reference_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|_| ReferenceError::SourceMissing)?;

            match target_case {
                None => Err(ReferenceError::SourceMissing),
                Some(target_case) if target_case != case_id => Err(ReferenceError::CrossContainer),
                Some(_) => {
                    // `source_id` is not persisted yet on the create path, so a
                    // chain that reaches it cannot exist; the walk still guards
                    // the update path, where it can.
                    let cycles = chain_contains(pool, reference_id, source_id)
                        .await
                        .map_err(|_| ReferenceError::Cycle)?;
                    if cycles {
                        Err(ReferenceError::Cycle)
                    } else {
                        Ok(())
                    }
                }
            }
        }
        (None, Some(entity_id)) => {
            let exists: Option<String> = sqlx::query_scalar("SELECT id FROM entities WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await
                .map_err(|_| ReferenceError::EntityMissing)?;

            match exists {
                Some(_) => Ok(()),
                None => Err(ReferenceError::EntityMissing),
            }
        }
    }
}

/// Loads the rating a reference carries, which is what a citing source
/// inherits. Returns `(reliability, credibility)`.
pub async fn reference_rating(
    pool: &SqlitePool,
    input: &ReferenceInput,
) -> Result<(Option<String>, Option<i32>), String> {
    if let Some(reference_id) = &input.source_id {
        let row: Option<(Option<String>, Option<i32>)> =
            sqlx::query_as("SELECT reliability_code, credibility_code FROM sources WHERE id = ?")
                .bind(reference_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Failed to read referenced source rating: {}", e))?;

        return row.ok_or_else(|| ReferenceError::SourceMissing.message().to_string());
    }

    Ok((None, None))
}

/// Reads an entity's Admiralty reliability code (A-F) from its Reliability
/// quality, if it has one.
pub async fn entity_reliability(
    pool: &SqlitePool,
    entity_id: &str,
) -> Result<Option<String>, String> {
    let value: Option<Option<String>> = sqlx::query_scalar(
        "SELECT value_string FROM entity_qualities WHERE entity_id = ? AND quality_type = 'reliability'",
    )
    .bind(entity_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to read entity reliability: {}", e))?;

    Ok(value.flatten())
}

/// The rating a citing source inherits from its reference.
///
/// Each field is a patch, using the same contract as the rest of the update
/// path: `None` leaves the source's own value alone, `Some(None)` clears it,
/// and `Some(Some(v))` sets it.
///
/// A **source** reference duplicates one capture, so both codes mirror it. An
/// **entity** reference only supplies reliability — that is a property of the
/// actor — while credibility stays the citing source's own assessment of this
/// particular information. Overwriting credibility here would silently discard
/// what the operator entered.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct InheritedRating {
    pub reliability: Option<Option<String>>,
    pub credibility: Option<Option<i32>>,
}

/// Resolves what a reference contributes to a citing source's rating.
pub async fn inherited_rating(
    pool: &SqlitePool,
    input: &ReferenceInput,
) -> Result<InheritedRating, String> {
    if let Some(entity_id) = &input.entity_id {
        return Ok(InheritedRating {
            reliability: Some(entity_reliability(pool, entity_id).await?),
            credibility: None,
        });
    }

    if input.source_id.is_some() {
        let (reliability, credibility) = reference_rating(pool, input).await?;
        return Ok(InheritedRating {
            reliability: Some(reliability),
            credibility: Some(credibility),
        });
    }

    Ok(InheritedRating::default())
}

impl InheritedRating {
    /// Applies this inheritance over a patched rating.
    ///
    /// A field the reference does not supply keeps whatever the caller patched,
    /// which is what lets an entity-referencing source keep its own credibility.
    pub fn apply_to(
        self,
        reliability: Option<Option<String>>,
        credibility: Option<Option<i32>>,
    ) -> (Option<Option<String>>, Option<Option<i32>>) {
        (
            self.reliability.or(reliability),
            self.credibility.or(credibility),
        )
    }
}

/// Resolves stored reference ids into a labelled reference for the UI.
pub async fn resolve_reference(
    pool: &SqlitePool,
    source_id: Option<&str>,
    entity_id: Option<&str>,
) -> Result<Option<SourceReference>, String> {
    if let Some(reference_id) = source_id {
        let row: Option<(String, Option<String>, Option<i32>)> = sqlx::query_as(
            "SELECT title, reliability_code, credibility_code FROM sources WHERE id = ?",
        )
        .bind(reference_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to resolve referenced source: {}", e))?;

        return Ok(row.map(
            |(label, reliability_code, credibility_code)| SourceReference {
                kind: ReferenceKind::Source,
                id: reference_id.to_string(),
                label,
                reliability_code,
                credibility_code,
            },
        ));
    }

    if let Some(ref_entity_id) = entity_id {
        let row: Option<String> = sqlx::query_scalar("SELECT name FROM entities WHERE id = ?")
            .bind(ref_entity_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to resolve referenced entity: {}", e))?;

        return Ok(row.map(|label| SourceReference {
            kind: ReferenceKind::Entity,
            id: ref_entity_id.to_string(),
            label,
            reliability_code: None,
            credibility_code: None,
        }));
    }

    Ok(None)
}

/// Builds a `?,?,?` placeholder list sized to `count`, for `IN (...)` clauses.
pub(crate) fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// Resolves a batch of stored references in two queries.
///
/// `get_sources` used to call [`resolve_reference`] once per row, which is two
/// queries per citing source. Collecting the distinct ids first keeps a large
/// case to one query per bounded id batch.
///
/// The returned map is keyed by the *citing* source id, so the caller can look
/// up each row's reference directly.
pub async fn resolve_references_for_sources(
    pool: &SqlitePool,
    sources: &[(String, Option<String>, Option<String>)],
) -> Result<std::collections::HashMap<String, Option<SourceReference>>, String> {
    use std::collections::{HashMap, HashSet};

    let mut resolved: HashMap<String, Option<SourceReference>> = sources
        .iter()
        .map(|(id, _, _)| (id.clone(), None))
        .collect();

    let source_ids: Vec<&str> = sources
        .iter()
        .filter_map(|(_, source_ref, _)| source_ref.as_deref())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let entity_ids: Vec<&str> = sources
        .iter()
        .filter_map(|(_, _, entity_ref)| entity_ref.as_deref())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    // Labels for the referenced sources, keyed by the referenced id.
    let mut source_labels: HashMap<String, SourceReference> = HashMap::new();
    for source_id_batch in source_ids.chunks(SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let placeholders = placeholders(source_id_batch.len());
        let query = format!(
            "SELECT id, title, reliability_code, credibility_code FROM sources WHERE id IN ({placeholders})"
        );

        let mut statement = sqlx::query(&query);
        for id in source_id_batch {
            statement = statement.bind(id);
        }

        let rows = statement
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to resolve referenced sources: {}", e))?;

        for row in &rows {
            let id: String = row.get("id");
            let label: String = row.get("title");
            let reliability: Option<String> = row.get("reliability_code");
            let credibility: Option<i32> = row.get("credibility_code");
            source_labels.insert(
                id.clone(),
                SourceReference {
                    kind: ReferenceKind::Source,
                    id,
                    label,
                    reliability_code: reliability,
                    credibility_code: credibility,
                },
            );
        }
    }

    // Labels for the referenced entities, keyed by the referenced id.
    let mut entity_labels: HashMap<String, SourceReference> = HashMap::new();
    for entity_id_batch in entity_ids.chunks(SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let placeholders = placeholders(entity_id_batch.len());
        let query = format!("SELECT id, name FROM entities WHERE id IN ({placeholders})");

        let mut statement = sqlx::query(&query);
        for id in entity_id_batch {
            statement = statement.bind(id);
        }

        let rows = statement
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to resolve referenced entities: {}", e))?;

        for row in &rows {
            let id: String = row.get("id");
            let label: String = row.get("name");
            entity_labels.insert(
                id.clone(),
                SourceReference {
                    kind: ReferenceKind::Entity,
                    id,
                    label,
                    reliability_code: None,
                    credibility_code: None,
                },
            );
        }
    }

    for (citing_id, source_ref, entity_ref) in sources {
        let reference = if let Some(source_ref) = source_ref {
            source_labels.get(source_ref).cloned()
        } else if let Some(entity_ref) = entity_ref {
            entity_labels.get(entity_ref).cloned()
        } else {
            None
        };

        if let Some(reference) = reference {
            resolved.insert(citing_id.clone(), Some(reference));
        }
    }

    Ok(resolved)
}

/// Copies a reference's rating onto every source that cites it, then repeats
/// down the chain so a citation of a citation stays in step.
///
/// The walk is a single recursive CTE rather than one query per level: a chain
/// of depth *n* used to cost O(n²) round-trips, and a long citation chain is
/// exactly the shape this feature produces (ten outlets citing one wire report
/// that itself cites an original).
///
/// The CTE carries a path so a cycle in historic data terminates instead of
/// recursing forever. The stance is cleared because citing *another source*
/// means duplicating one piece of evidence; entity citations are handled by
/// [`propagate_entity_rating`], which leaves the stance alone.
pub async fn propagate_rating(pool: &SqlitePool, reference_source_id: &str) -> Result<(), String> {
    let rating: Option<(Option<String>, Option<i32>)> =
        sqlx::query_as("SELECT reliability_code, credibility_code FROM sources WHERE id = ?")
            .bind(reference_source_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to read reference rating for propagation: {}", e))?;

    let Some((reliability, credibility)) = rating else {
        return Ok(());
    };

    let now = Utc::now().to_rfc3339();

    // The CTE walks `reference_source_id` edges, accumulating a path so a cycle
    // cannot loop. `cycle` guards against revisiting a node already on the path.
    sqlx::query(
        "WITH RECURSIVE chain(id, path) AS ( \
             SELECT id, ',' || id || ',' FROM sources WHERE reference_source_id = ? \
             UNION ALL \
             SELECT s.id, chain.path || s.id || ',' \
             FROM sources s \
             JOIN chain ON s.reference_source_id = chain.id \
             WHERE chain.path NOT LIKE '%,' || s.id || ',%' \
         ) \
         UPDATE sources \
         SET reliability_code = ?, credibility_code = ?, stance = NULL, updated_at = ? \
         WHERE id IN (SELECT id FROM chain)",
    )
    .bind(reference_source_id)
    .bind(&reliability)
    .bind(credibility)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to propagate rating to dependent sources: {}", e))?;

    Ok(())
}

/// Copies an entity's reliability quality onto every source that cites it.
///
/// Entities cite nothing themselves, so unlike source references this needs
/// no chain walk. Only the reliability_code is updated; credibility and
/// stance are left untouched because an entity's reliability quality is a
/// single Admiralty code.
pub async fn propagate_entity_rating(pool: &SqlitePool, entity_id: &str) -> Result<(), String> {
    // A missing or blank value clears the previously inherited code.
    let reliability = entity_reliability(pool, entity_id)
        .await?
        .filter(|code| !code.is_empty());

    let now = Utc::now().to_rfc3339();
    // The stance is deliberately untouched: an entity can express several
    // viewpoints, so its citations remain independently classifiable.
    sqlx::query(
        "UPDATE sources SET reliability_code = ?, updated_at = ? WHERE reference_entity_id = ?",
    )
    .bind(reliability)
    .bind(&now)
    .bind(entity_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to propagate entity rating: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::resolve_references_for_sources;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn reference_resolution_batches_large_source_and_entity_sets() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database");

        sqlx::query(
            "CREATE TABLE sources (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                reliability_code TEXT,
                credibility_code INTEGER
            );
            CREATE TABLE entities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );",
        )
        .execute(&pool)
        .await
        .expect("reference schema");

        let mut references = Vec::new();
        for index in 0..901 {
            let source_id = format!("source-ref-{index}");
            let entity_id = format!("entity-ref-{index}");
            sqlx::query("INSERT INTO sources (id, title) VALUES (?, ?)")
                .bind(&source_id)
                .bind(format!("Source {index}"))
                .execute(&pool)
                .await
                .expect("source row");
            sqlx::query("INSERT INTO entities (id, name) VALUES (?, ?)")
                .bind(&entity_id)
                .bind(format!("Entity {index}"))
                .execute(&pool)
                .await
                .expect("entity row");
            references.push((format!("citing-source-{index}"), Some(source_id), None));
            references.push((format!("citing-entity-{index}"), None, Some(entity_id)));
        }

        let resolved = resolve_references_for_sources(&pool, &references)
            .await
            .expect("batched reference lookup");

        assert_eq!(resolved.len(), 1802);
        assert_eq!(
            resolved["citing-source-900"]
                .as_ref()
                .map(|reference| reference.label.as_str()),
            Some("Source 900")
        );
        assert_eq!(
            resolved["citing-entity-900"]
                .as_ref()
                .map(|reference| reference.label.as_str()),
            Some("Entity 900")
        );
    }
}
