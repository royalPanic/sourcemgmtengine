//! Applies the production migrations to a real SQLite database and asserts the
//! v4 changes land correctly on a database that already has v1–v3 data.
//!
//! The point is the upgrade path, not the fresh install: `ALTER TABLE` must
//! leave existing sources readable, default the new columns to NULL, and the
//! triggers must be in place afterwards.

#[cfg(test)]
mod tests {
    use crate::database::migrations::get_migrations;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;
    use tauri_plugin_sql::MigrationKind;

    /// Runs every `Up` migration in version order, the way the SQL plugin does.
    async fn apply_migrations_through(pool: &sqlx::SqlitePool, last_version: i64) {
        let mut migrations = get_migrations();
        migrations.sort_by_key(|m| m.version);

        for migration in migrations {
            if migration.version > last_version {
                continue;
            }
            if !matches!(migration.kind, MigrationKind::Up) {
                continue;
            }
            for statement in split_statements(migration.sql) {
                sqlx::query(&statement)
                    .execute(pool)
                    .await
                    .unwrap_or_else(|e| {
                        panic!(
                            "migration {} ({}) failed on: {}\n{}",
                            migration.version, migration.description, statement, e
                        )
                    });
            }
        }
    }

    async fn apply_all(pool: &sqlx::SqlitePool) {
        apply_migrations_through(pool, i64::MAX).await;
    }

    async fn apply_migration(pool: &sqlx::SqlitePool, version: i64) {
        let migration = get_migrations()
            .into_iter()
            .find(|migration| migration.version == version)
            .expect("migration version exists");

        for statement in split_statements(migration.sql) {
            sqlx::query(&statement)
                .execute(pool)
                .await
                .unwrap_or_else(|e| {
                    panic!(
                        "migration {} ({}) failed on: {}\n{}",
                        migration.version, migration.description, statement, e
                    )
                });
        }
    }

    /// Splits a migration body into individual statements.
    ///
    /// Triggers contain semicolons inside `BEGIN ... END`, so splitting on `;`
    /// alone would tear them apart. This tracks block depth instead.
    fn split_statements(sql: &str) -> Vec<String> {
        let mut statements = Vec::new();
        let mut current = String::new();
        let mut in_trigger = false;

        for line in sql.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") {
                continue;
            }

            let upper = trimmed.to_uppercase();
            if upper.starts_with("CREATE TRIGGER") {
                in_trigger = true;
            }

            current.push_str(line);
            current.push('\n');

            let ends_block = in_trigger && upper == "END;";
            if ends_block {
                in_trigger = false;
                statements.push(current.trim().to_string());
                current.clear();
                continue;
            }

            if !in_trigger && trimmed.ends_with(';') {
                statements.push(current.trim().to_string());
                current.clear();
            }
        }

        if !current.trim().is_empty() {
            statements.push(current.trim().to_string());
        }

        statements
    }

    async fn fresh_pool() -> sqlx::SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite")
    }

    #[tokio::test]
    async fn migrations_apply_cleanly_from_scratch() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        for table in [
            "cases",
            "case_notes",
            "sources",
            "source_attachments",
            "entities",
        ] {
            let found: Option<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .bind(table)
            .fetch_optional(&pool)
            .await
            .unwrap();
            assert_eq!(found.as_deref(), Some(table), "missing table {table}");
        }
    }

    #[tokio::test]
    async fn the_v4_upgrade_preserves_existing_sources() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'event')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, case_id, title, reliability_code, credibility_code, stance) \
             VALUES ('s1', 'c1', 'Pre-existing', 'B', 2, 'supports')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let row = sqlx::query(
            "SELECT title, reliability_code, credibility_code, stance, \
             reference_source_id, reference_entity_id FROM sources WHERE id = 's1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.get::<String, _>("title"), "Pre-existing");
        assert_eq!(row.get::<String, _>("reliability_code"), "B");
        assert_eq!(row.get::<i32, _>("credibility_code"), 2);
        assert_eq!(row.get::<String, _>("stance"), "supports");
        assert_eq!(
            row.get::<Option<String>, _>("reference_source_id"),
            None,
            "existing rows must default to no reference"
        );
        assert_eq!(row.get::<Option<String>, _>("reference_entity_id"), None);
    }

    #[tokio::test]
    async fn the_v4_triggers_block_both_references() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'A')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO entities (id, entity_type, name) VALUES ('m1', 'organization', 'Reuters')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let insert_both = sqlx::query(
            "INSERT INTO sources (id, case_id, title, reference_source_id, reference_entity_id) \
             VALUES ('bad', 'c1', 'Bad', 's1', 'm1')",
        )
        .execute(&pool)
        .await;
        assert!(insert_both.is_err(), "insert trigger must fire");

        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s2', 'c1', 'B')")
            .execute(&pool)
            .await
            .unwrap();

        let update_both = sqlx::query(
            "UPDATE sources SET reference_source_id = 's1', reference_entity_id = 'm1' WHERE id = 's2'",
        )
        .execute(&pool)
        .await;
        assert!(update_both.is_err(), "update trigger must fire");
    }

    #[tokio::test]
    async fn entity_qualities_are_constrained() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO entities (id, entity_type, name, case_id, is_global) VALUES ('e1', 'organization', 'Reuters', 'c1', 0)")
            .execute(&pool)
            .await
            .expect("valid entity must be accepted");
        sqlx::query("INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) VALUES ('q1', 'e1', 'Reliability', 'string', 'A')")
            .execute(&pool)
            .await
            .expect("valid quality must be accepted");

        assert!(sqlx::query("INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) VALUES ('bad1', 'e1', 'Test', 'invalid_type', 'x')")
            .execute(&pool)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn deleting_a_referenced_source_clears_the_link_only() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title, reliability_code, credibility_code) VALUES ('core', 'c1', 'Core', 'A', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title, reliability_code, credibility_code, reference_source_id) VALUES ('echo', 'c1', 'Echo', 'A', 1, 'core')")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "UPDATE sources SET reference_source_id = NULL WHERE reference_source_id = 'core'",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("DELETE FROM sources WHERE id = 'core'")
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query(
            "SELECT reference_source_id, reliability_code FROM sources WHERE id = 'echo'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.get::<Option<String>, _>("reference_source_id"), None);
        assert_eq!(
            row.get::<String, _>("reliability_code"),
            "A",
            "the citation keeps the rating it inherited"
        );
    }

    #[tokio::test]
    async fn the_v6_migration_creates_entity_tables() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        for table in ["entities", "entity_qualities", "quality_source_refs"] {
            let found: Option<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .bind(table)
            .fetch_optional(&pool)
            .await
            .unwrap();
            assert_eq!(found.as_deref(), Some(table), "missing table {table}");
        }

        // Verify the quality_type CHECK constraint.
        assert!(sqlx::query(
            "INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) \
             VALUES ('q1', 'e1', 'Test', 'invalid_type', 'x')",
        )
        .execute(&pool)
        .await
        .is_err(), "invalid quality type must be rejected");

        // Verify quality_source_refs foreign keys cascade.
        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO entities (id, entity_type, name, case_id, is_global) VALUES ('e1', 'person', 'Test Person', 'c1', 0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) VALUES ('q1', 'e1', 'Name', 'string', 'Test')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'Source')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO quality_source_refs (id, quality_id, source_id) VALUES ('r1', 'q1', 's1')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Deleting the entity should cascade-delete its qualities and source refs.
        sqlx::query("DELETE FROM entities WHERE id = 'e1'")
            .execute(&pool)
            .await
            .unwrap();

        let quality_count: Option<i64> =
            sqlx::query_scalar("SELECT COUNT(*) FROM entity_qualities WHERE entity_id = 'e1'")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert_eq!(
            quality_count,
            Some(0),
            "qualities should cascade on entity delete"
        );

        let ref_count: Option<i64> =
            sqlx::query_scalar("SELECT COUNT(*) FROM quality_source_refs WHERE quality_id = 'q1'")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert_eq!(
            ref_count,
            Some(0),
            "source refs should cascade on quality delete"
        );
    }

    #[tokio::test]
    async fn the_v9_upgrade_adds_verification_columns() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        // A row written before v9 has no verification data; the new columns
        // must default rather than fail the upgrade.
        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'Source')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO source_attachments (id, source_id, file_name, relative_path) \
             VALUES ('a1', 's1', 'photo.png', 'attachments/s1/photo.png')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO source_timestamp (id, source_attachment_id, ots_path, status) \
             VALUES ('t1', 'a1', 'attachments/s1/photo.png.ots', 'pending')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let row = sqlx::query(
            "SELECT block_height, block_time, verification_notes FROM source_timestamp WHERE id = 't1'",
        )
        .fetch_one(&pool)
        .await
        .expect("row must survive the upgrade");

        assert_eq!(row.get::<Option<i64>, _>("block_height"), None);
        assert_eq!(row.get::<Option<String>, _>("block_time"), None);
        assert_eq!(
            row.get::<String, _>("verification_notes"),
            "[]",
            "notes must default to an empty JSON array"
        );
    }

    #[tokio::test]
    async fn verification_data_round_trips_through_the_new_columns() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'Source')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO source_attachments (id, source_id, file_name, relative_path) \
             VALUES ('a1', 's1', 'photo.png', 'attachments/s1/photo.png')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO source_timestamp (id, source_attachment_id, ots_path, status) \
             VALUES ('t1', 'a1', 'attachments/s1/photo.png.ots', 'pending')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "UPDATE source_timestamp \
             SET status = 'confirmed', confirmed_at = '2026-01-01T00:00:00+00:00', \
                 block_height = 800000, block_time = '2023-07-24T03:17:09+00:00', \
                 verification_notes = ? \
             WHERE id = 't1'",
        )
        .bind(r#"["Bitcoin block 800000 merkle root matches"]"#)
        .execute(&pool)
        .await
        .unwrap();

        let row = sqlx::query(
            "SELECT status, block_height, block_time, verification_notes \
             FROM source_timestamp WHERE id = 't1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.get::<String, _>("status"), "confirmed");
        assert_eq!(row.get::<Option<i64>, _>("block_height"), Some(800_000));
        assert_eq!(
            row.get::<Option<String>, _>("block_time"),
            Some("2023-07-24T03:17:09+00:00".to_string())
        );

        let notes: String = row.get("verification_notes");
        let parsed: Vec<String> = serde_json::from_str(&notes).expect("notes are valid JSON");
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].contains("merkle root matches"));
    }

    #[tokio::test]
    async fn the_v10_upgrade_drops_meta_sources() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        // v4 created `meta_sources` and v7 stopped using it; v10 removes it.
        let found: Option<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta_sources'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap();
        assert_eq!(found, None, "meta_sources must be dropped");

        // The column went with it.
        let columns: Vec<String> = sqlx::query("PRAGMA table_info(sources)")
            .fetch_all(&pool)
            .await
            .unwrap()
            .iter()
            .map(|row| row.get::<String, _>("name"))
            .collect();
        assert!(
            !columns.iter().any(|c| c == "reference_meta_source_id"),
            "reference_meta_source_id must be gone, got {columns:?}"
        );
        assert!(
            columns.iter().any(|c| c == "reference_entity_id"),
            "reference_entity_id must survive, got {columns:?}"
        );
    }

    #[tokio::test]
    async fn the_v10_upgrade_preserves_sources_and_their_references() {
        let pool = fresh_pool().await;
        apply_migrations_through(&pool, 9).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO entities (id, entity_type, name) VALUES ('e1', 'organization', 'Reuters')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO entity_qualities (id, entity_id, quality_name, quality_type, value_string) \
             VALUES ('q1', 'e1', 'Reliability', 'reliability', 'B')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, case_id, title, reliability_code, credibility_code, stance, \
             reference_entity_id, source_date, source_time) \
             VALUES ('s1', 'c1', 'Citing', 'B', 2, 'supports', 'e1', '2026-01-01', '09:30')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, case_id, title, reference_source_id) \
             VALUES ('s2', 'c1', 'Citing source', 's1')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO source_attachments (id, source_id, file_name, relative_path, mime_type, file_size) \
             VALUES ('a1', 's1', 'photo.png', 'attachments/s1/photo.png', 'image/png', 123)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO source_timestamp (id, source_attachment_id, ots_path, status, block_height, verification_notes) \
             VALUES ('t1', 'a1', 'attachments/s1/photo.png.ots', 'confirmed', 800000, '[\"verified\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO quality_source_refs (id, quality_id, source_id, reliability_code, credibility_code) \
             VALUES ('r1', 'q1', 's1', 'B', 2)",
        )
        .execute(&pool)
        .await
        .unwrap();

        apply_migration(&pool, 10).await;

        let row = sqlx::query(
            "SELECT title, reliability_code, credibility_code, stance, reference_entity_id, \
             source_date, source_time FROM sources WHERE id = 's1'",
        )
        .fetch_one(&pool)
        .await
        .expect("source must survive the rebuild");

        assert_eq!(row.get::<String, _>("title"), "Citing");
        assert_eq!(row.get::<String, _>("reliability_code"), "B");
        assert_eq!(row.get::<i32, _>("credibility_code"), 2);
        assert_eq!(row.get::<String, _>("stance"), "supports");
        assert_eq!(
            row.get::<Option<String>, _>("reference_entity_id"),
            Some("e1".to_string())
        );
        assert_eq!(
            row.get::<Option<String>, _>("source_date"),
            Some("2026-01-01".to_string())
        );

        let source_reference: Option<String> =
            sqlx::query_scalar("SELECT reference_source_id FROM sources WHERE id = 's2'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(source_reference.as_deref(), Some("s1"));

        let attachment_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM source_attachments WHERE id = 'a1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let timestamp_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM source_timestamp WHERE id = 't1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let provenance_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM quality_source_refs WHERE id = 'r1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(attachment_count, 1, "attachments must survive the rebuild");
        assert_eq!(
            timestamp_count, 1,
            "timestamp records must survive the rebuild"
        );
        assert_eq!(
            provenance_count, 1,
            "quality provenance must survive the rebuild"
        );
    }

    #[tokio::test]
    async fn the_v10_triggers_still_block_both_references() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'A')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO entities (id, entity_type, name) VALUES ('e1', 'organization', 'Reuters')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let insert_both = sqlx::query(
            "INSERT INTO sources (id, case_id, title, reference_source_id, reference_entity_id) \
             VALUES ('bad', 'c1', 'Bad', 's1', 'e1')",
        )
        .execute(&pool)
        .await;
        assert!(insert_both.is_err(), "insert trigger must fire after v10");

        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s2', 'c1', 'B')")
            .execute(&pool)
            .await
            .unwrap();

        let update_both = sqlx::query(
            "UPDATE sources SET reference_source_id = 's1', reference_entity_id = 'e1' WHERE id = 's2'",
        )
        .execute(&pool)
        .await;
        assert!(update_both.is_err(), "update trigger must fire after v10");
    }

    #[tokio::test]
    async fn the_v11_upgrade_creates_entity_types() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        let found: Option<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_types'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap();
        assert_eq!(
            found.as_deref(),
            Some("entity_types"),
            "missing table entity_types"
        );

        // A template round-trips its default qualities as JSON.
        sqlx::query(
            "INSERT INTO entity_types (id, name, description, default_qualities, is_builtin) \
             VALUES ('vehicle', 'Vehicle', 'A vehicle', '[{\"name\":\"VIN\",\"type\":\"string\",\"required\":true}]', 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let (name, qualities, is_builtin): (String, String, i64) = sqlx::query_as(
            "SELECT name, default_qualities, is_builtin FROM entity_types WHERE id = 'vehicle'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(name, "Vehicle");
        assert_eq!(is_builtin, 0);
        assert!(
            qualities.contains("\"required\":true"),
            "qualities must round-trip: {qualities}"
        );
    }
}
