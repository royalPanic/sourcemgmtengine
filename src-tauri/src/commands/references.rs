//! Source references: a source may cite either a sibling source in the same
//! container or a global meta source, to record "this is a report *of* that".
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

use crate::models::models::{ReferenceKind, SourceReference};

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
            ReferenceError::Ambiguous => {
                "A source may reference a source or an entity, not both"
            }
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
            let exists: Option<String> =
                sqlx::query_scalar("SELECT id FROM entities WHERE id = ?")
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
        let row: Option<(Option<String>, Option<i32>)> = sqlx::query_as(
            "SELECT reliability_code, credibility_code FROM sources WHERE id = ?",
        )
        .bind(reference_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to read referenced source rating: {}", e))?;

        return row.ok_or_else(|| ReferenceError::SourceMissing.message().to_string());
    }

    Ok((None, None))
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

        return Ok(row.map(|(label, reliability_code, credibility_code)| SourceReference {
            kind: ReferenceKind::Source,
            id: reference_id.to_string(),
            label,
            reliability_code,
            credibility_code,
        }));
    }

    if let Some(ref_entity_id) = entity_id {
        let row: Option<String> = sqlx::query_scalar(
            "SELECT name FROM entities WHERE id = ?",
        )
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

/// Copies a reference's rating onto every source that cites it, then repeats
/// down the chain so a citation of a citation stays in step.
///
/// Only sources that are *not* themselves citing something need a copy; the
/// rest get theirs from the pass that follows them. `visited` keeps the walk
/// finite if historic data already contains a cycle.
///
/// Boxed because the recursion has to cross an await point.
pub fn propagate_rating<'a>(
    pool: &'a SqlitePool,
    reference_source_id: &'a str,
    visited: &'a mut Vec<String>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        if visited.iter().any(|id| id == reference_source_id) {
            return Ok(());
        }
        visited.push(reference_source_id.to_string());

        let rating: Option<(Option<String>, Option<i32>)> = sqlx::query_as(
            "SELECT reliability_code, credibility_code FROM sources WHERE id = ?",
        )
        .bind(reference_source_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to read reference rating for propagation: {}", e))?;

        let Some((reliability, credibility)) = rating else {
            return Ok(());
        };

        let children: Vec<String> =
            sqlx::query_scalar("SELECT id FROM sources WHERE reference_source_id = ?")
                .bind(reference_source_id)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to find dependent sources: {}", e))?;

        let now = Utc::now().to_rfc3339();
        for child in &children {
            // The stance is cleared here because citing *another source* means
            // duplicating one piece of evidence. Meta-source citations are handled
            // by `propagate_meta_rating`, which leaves the stance alone.
            sqlx::query(
                "UPDATE sources SET reliability_code = ?, credibility_code = ?, stance = NULL, updated_at = ? WHERE id = ?",
            )
            .bind(&reliability)
            .bind(credibility)
            .bind(&now)
            .bind(child)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to propagate rating to dependent source: {}", e))?;

            propagate_rating(pool, child, visited).await?;
        }

        Ok(())
    })
}

/// Copies an entity's reliability quality onto every source that cites it.
///
/// Entities cite nothing themselves, so unlike source references this needs
/// no chain walk. Only the reliability_code is updated; credibility and
/// stance are left untouched because an entity's reliability quality is a
/// single Admiralty code.
pub async fn propagate_entity_rating(
    pool: &SqlitePool,
    entity_id: &str,
) -> Result<(), String> {
    let reliability: Option<String> = sqlx::query_scalar(
        "SELECT value_string FROM entity_qualities WHERE entity_id = ? AND quality_type = 'reliability'",
    )
    .bind(entity_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to read entity reliability for propagation: {}", e))?;

    let Some(reliability) = reliability else {
        return Ok(());
    };

    let now = Utc::now().to_rfc3339();
    // The stance is deliberately untouched: an entity can express several
    // viewpoints, so its citations remain independently classifiable.
    sqlx::query(
        "UPDATE sources SET reliability_code = ?, updated_at = ? WHERE reference_entity_id = ?",
    )
    .bind(&reliability)
    .bind(&now)
    .bind(entity_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to propagate entity rating: {}", e))?;

    Ok(())
}
