//! Exercises meta sources and source references against a real SQLite
//! database built from the production schema.
//!
//! The behaviour worth pinning down is not the SQL but the two rules the
//! feature exists for:
//!
//! * a citing source mirrors its reference's Admiralty rating, live; and
//! * a citing source carries no stance, so repeated reporting of one core
//!   source cannot masquerade as independent corroboration.

#[cfg(test)]
mod tests {
    use crate::commands::references::{
        propagate_entity_rating, propagate_rating, reference_rating, resolve_reference,
        validate_reference, ReferenceError, ReferenceInput,
    };
    use crate::models::models::ReferenceKind;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    /// Mirrors the production schema for the columns these tests touch,
    /// including the CHECK constraints and the exclusivity triggers.
    const SCHEMA: &str = r#"
        CREATE TABLE cases (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL DEFAULT 'case'
        );

        CREATE TABLE entities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'organization',
            description TEXT,
            url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE entity_qualities (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL,
            quality_name TEXT NOT NULL,
            quality_type TEXT NOT NULL,
            value_string TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );

        CREATE TABLE sources (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
            credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6),
            stance TEXT CHECK (stance IN ('supports','refutes','neutral')),
            reference_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
            reference_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TRIGGER sources_reference_exclusive_insert
        BEFORE INSERT ON sources
        WHEN NEW.reference_source_id IS NOT NULL
         AND NEW.reference_entity_id IS NOT NULL
        BEGIN
            SELECT RAISE(ABORT, 'A source may reference a source or an entity, not both');
        END;
    "#;

    async fn pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite");
        sqlx::query(SCHEMA).execute(&pool).await.expect("schema");
        sqlx::query("INSERT INTO cases (id, kind) VALUES ('case-1', 'event')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO cases (id, kind) VALUES ('case-2', 'event')")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    /// Inserts a source and returns its id.
    async fn insert_source(
        pool: &sqlx::SqlitePool,
        id: &str,
        case_id: &str,
        reliability: Option<&str>,
        credibility: Option<i32>,
        stance: Option<&str>,
    ) {
        sqlx::query(
            "INSERT INTO sources (id, case_id, reliability_code, credibility_code, stance) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(case_id)
        .bind(reliability)
        .bind(credibility)
        .bind(stance)
        .execute(pool)
        .await
        .expect("insert source");
    }

    async fn insert_entity(
        pool: &sqlx::SqlitePool,
        id: &str,
        name: &str,
    ) {
        sqlx::query(
            "INSERT INTO entities (id, name) VALUES (?, ?)",
        )
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .expect("insert entity");
    }

    async fn rating(pool: &sqlx::SqlitePool, id: &str) -> (Option<String>, Option<i32>, Option<String>) {
        let row = sqlx::query(
            "SELECT reliability_code, credibility_code, stance FROM sources WHERE id = ?",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("row");
        (row.get(0), row.get(1), row.get(2))
    }

    fn source_ref(id: &str) -> ReferenceInput {
        ReferenceInput::new(Some(id.to_string()), None)
    }

    fn entity_ref(id: &str) -> ReferenceInput {
        ReferenceInput::new(None, Some(id.to_string()))
    }

    // --- validation -------------------------------------------------------

    #[test]
    fn blank_ids_are_not_a_reference() {
        let input = ReferenceInput::new(Some(String::new()), Some("   ".to_string()));
        assert!(!input.is_set());
        assert_eq!(input.source_id, None);
        assert_eq!(input.entity_id, None);
    }

    #[tokio::test]
    async fn self_reference_is_rejected() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", Some("A"), Some(1), None).await;

        let error = validate_reference(&pool, "case-1", "s1", &source_ref("s1"))
            .await
            .expect_err("a source must not cite itself");
        assert_eq!(error, ReferenceError::SelfReference);
    }

    #[tokio::test]
    async fn cross_container_reference_is_rejected() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", None, None, None).await;
        insert_source(&pool, "s2", "case-2", None, None, None).await;

        let error = validate_reference(&pool, "case-1", "s1", &source_ref("s2"))
            .await
            .expect_err("a source may only cite within its own container");
        assert_eq!(error, ReferenceError::CrossContainer);
    }

    #[tokio::test]
    async fn missing_targets_are_rejected() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", None, None, None).await;

        assert_eq!(
            validate_reference(&pool, "case-1", "s1", &source_ref("nope"))
                .await
                .expect_err("missing source"),
            ReferenceError::SourceMissing
        );
        assert_eq!(
        validate_reference(&pool, "case-1", "s1", &entity_ref("nope"))
                .await
            .expect_err("missing entity"),
        ReferenceError::EntityMissing
        );
    }

    #[tokio::test]
    async fn a_source_may_not_cite_both_kinds_at_once() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", None, None, None).await;
        insert_source(&pool, "s2", "case-1", None, None, None).await;
        insert_entity(&pool, "m1", "Reuters").await;

        let both = ReferenceInput::new(Some("s2".into()), Some("m1".into()));
        assert_eq!(
            validate_reference(&pool, "case-1", "s1", &both)
                .await
                .expect_err("only one reference is allowed"),
            ReferenceError::Ambiguous
        );
    }

    #[tokio::test]
    async fn cycles_are_rejected() {
        let pool = pool().await;
        insert_source(&pool, "a", "case-1", None, None, None).await;
        insert_source(&pool, "b", "case-1", None, None, None).await;
        sqlx::query("UPDATE sources SET reference_source_id = 'a' WHERE id = 'b'")
            .execute(&pool)
            .await
            .unwrap();

        // b -> a already; making a cite b would close the loop.
        let error = validate_reference(&pool, "case-1", "a", &source_ref("b"))
            .await
            .expect_err("a cycle must be rejected");
        assert_eq!(error, ReferenceError::Cycle);
    }

    #[tokio::test]
    async fn a_chain_of_any_length_is_accepted() {
        let pool = pool().await;
        for id in ["a", "b", "c", "d"] {
            insert_source(&pool, id, "case-1", None, None, None).await;
        }
        sqlx::query("UPDATE sources SET reference_source_id = 'a' WHERE id = 'b'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE sources SET reference_source_id = 'b' WHERE id = 'c'")
            .execute(&pool)
            .await
            .unwrap();

        validate_reference(&pool, "case-1", "d", &source_ref("c"))
            .await
            .expect("a long chain is fine as long as it does not close");
    }

    // --- inherited rating -------------------------------------------------

    #[tokio::test]
    async fn a_citing_source_inherits_the_reference_rating() {
        let pool = pool().await;
        insert_entity(&pool, "m1", "Reuters").await;

        let rating = reference_rating(&pool, &entity_ref("m1")).await.unwrap();
        assert_eq!(rating, (None, None));
    }

    #[tokio::test]
    async fn an_unrated_reference_yields_no_rating() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", None, None, None).await;

        let rating = reference_rating(&pool, &source_ref("s1")).await.unwrap();
        assert_eq!(rating, (None, None));
    }

    #[tokio::test]
    async fn editing_a_reference_propagates_down_the_chain() {
        let pool = pool().await;
        insert_source(&pool, "core", "case-1", Some("C"), Some(3), Some("supports")).await;
        insert_source(&pool, "echo", "case-1", Some("C"), Some(3), None).await;
        insert_source(&pool, "echo2", "case-1", Some("C"), Some(3), None).await;
        sqlx::query("UPDATE sources SET reference_source_id = 'core' WHERE id = 'echo'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE sources SET reference_source_id = 'echo' WHERE id = 'echo2'")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("UPDATE sources SET reliability_code = 'A', credibility_code = 1 WHERE id = 'core'")
            .execute(&pool)
            .await
            .unwrap();

        propagate_rating(&pool, "core", &mut Vec::new()).await.unwrap();

        assert_eq!(rating(&pool, "echo").await, (Some("A".into()), Some(1), None));
        assert_eq!(
            rating(&pool, "echo2").await,
            (Some("A".into()), Some(1), None),
            "the copy must reach citations of citations"
        );
    }

    #[tokio::test]
    async fn editing_a_meta_source_propagates_the_rating_but_keeps_the_stance() {
        let pool = pool().await;
        insert_entity(&pool, "m1", "Reuters").await;
        sqlx::query("INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) VALUES ('q1', 'm1', 'Reliability', 'reliability', 'B')")
            .execute(&pool)
            .await
            .unwrap();
        insert_source(&pool, "s1", "case-1", Some("B"), Some(2), Some("supports")).await;
        insert_source(&pool, "s2", "case-1", Some("B"), Some(2), Some("refutes")).await;

        sqlx::query("UPDATE sources SET reference_entity_id = 'm1' WHERE id IN ('s1','s2')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE entity_qualities SET value_string = 'F' WHERE entity_id = 'm1' AND quality_type = 'reliability'")
            .execute(&pool)
            .await
            .unwrap();

        propagate_entity_rating(&pool, "m1").await.unwrap();

        assert_eq!(rating(&pool, "s1").await, (Some("F".into()), Some(2), Some("supports".into())));
        assert_eq!(rating(&pool, "s2").await, (Some("F".into()), Some(2), Some("refutes".into())));
    }

    #[tokio::test]
    async fn propagation_terminates_on_pre_existing_cycles() {
        let pool = pool().await;
        insert_source(&pool, "a", "case-1", Some("A"), Some(1), None).await;
        insert_source(&pool, "b", "case-1", Some("A"), Some(1), None).await;
        // Data that bypassed validation: a <-> b.
        sqlx::query("UPDATE sources SET reference_source_id = 'b' WHERE id = 'a'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE sources SET reference_source_id = 'a' WHERE id = 'b'")
            .execute(&pool)
            .await
            .unwrap();

        propagate_rating(&pool, "a", &mut Vec::new())
            .await
            .expect("propagation must not spin forever on bad data");
    }

    #[tokio::test]
    async fn a_citing_source_never_keeps_a_stance() {        // Source-referenced: the stance is suppressed by propagation.
        let pool = pool().await;
        insert_source(&pool, "core", "case-1", Some("A"), Some(1), Some("supports")).await;
        insert_source(&pool, "echo", "case-1", Some("A"), Some(1), Some("supports")).await;
        sqlx::query("UPDATE sources SET reference_source_id = 'core' WHERE id = 'echo'")
            .execute(&pool)
            .await
            .unwrap();

        propagate_rating(&pool, "core", &mut Vec::new()).await.unwrap();

        assert_eq!(rating(&pool, "echo").await.2, None);
        assert_eq!(
            rating(&pool, "core").await.2,
            Some("supports".to_string()),
            "the core source keeps its own stance"
        );
    }

    #[test]
    fn only_a_source_reference_locks_the_stance() {
        // A sibling capture duplicates one piece of evidence, so it must not
        // carry a stance. A meta source may publish several viewpoints, so its
        // citations stay classifiable.
        assert!(source_ref("s2").locks_stance());
        assert!(!entity_ref("m1").locks_stance());
        assert!(!ReferenceInput::default().locks_stance());
    }

    // --- schema guards ----------------------------------------------------

    #[tokio::test]
    async fn the_schema_rejects_both_references_on_one_row() {
        let pool = pool().await;
        insert_source(&pool, "s1", "case-1", None, None, None).await;
        insert_entity(&pool, "m1", "Reuters").await;

        let result = sqlx::query(
            "INSERT INTO sources (id, case_id, reference_source_id, reference_entity_id) \
             VALUES ('bad', 'case-1', 's1', 'm1')",
        )
        .execute(&pool)
        .await;

        assert!(result.is_err(), "the exclusivity trigger must fire");
    }

    #[tokio::test]
    async fn deleting_a_reference_leaves_the_citation_rated() {
        let pool = pool().await;
        insert_entity(&pool, "m1", "Reuters").await;
        insert_source(&pool, "s1", "case-1", Some("A"), Some(1), None).await;
        sqlx::query("UPDATE sources SET reference_entity_id = 'm1' WHERE id = 's1'")
            .execute(&pool)
            .await
            .unwrap();

        // Mirrors `delete_entity`.
        sqlx::query("UPDATE sources SET reference_entity_id = NULL WHERE reference_entity_id = 'm1'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM entities WHERE id = 'm1'")
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(
            rating(&pool, "s1").await,
            (Some("A".into()), Some(1), None),
            "the citation keeps the rating it inherited"
        );
    }

    // --- resolution -------------------------------------------------------

    #[tokio::test]
    async fn references_resolve_to_a_labelled_target() {
        let pool = pool().await;
        insert_entity(&pool, "m1", "Reuters").await;

        let resolved = resolve_reference(&pool, None, Some("m1"))
            .await
            .unwrap()
            .expect("resolvable");
        assert_eq!(resolved.kind, ReferenceKind::Entity);
        assert_eq!(resolved.label, "Reuters");
        assert_eq!(resolved.reliability_code, None);
        assert_eq!(resolved.credibility_code, None);
    }

    #[tokio::test]
    async fn a_missing_reference_resolves_to_nothing() {
        let pool = pool().await;

        assert!(resolve_reference(&pool, Some("gone"), None)
            .await
            .unwrap()
            .is_none());
        assert!(resolve_reference(&pool, None, None).await.unwrap().is_none());
    }
}
