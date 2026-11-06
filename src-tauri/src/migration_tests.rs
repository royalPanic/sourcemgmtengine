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
    async fn apply_all(pool: &sqlx::SqlitePool) {
        let mut migrations = get_migrations();
        migrations.sort_by_key(|m| m.version);

        for migration in migrations {
            if !matches!(migration.kind, MigrationKind::Up) {
                continue;
            }
            for statement in split_statements(migration.sql) {
                sqlx::query(&statement)
                    .execute(pool)
                    .await
                    .unwrap_or_else(|e| {
                        panic!("migration {} ({}) failed on: {}\n{}", migration.version, migration.description, statement, e)
                    });
            }
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

        for table in ["cases", "case_notes", "sources", "source_attachments", "meta_sources"] {
            let found: Option<String> =
                sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
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
             reference_source_id, reference_meta_source_id FROM sources WHERE id = 's1'",
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
        assert_eq!(row.get::<Option<String>, _>("reference_meta_source_id"), None);
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
        sqlx::query("INSERT INTO meta_sources (id, name) VALUES ('m1', 'Reuters')")
            .execute(&pool)
            .await
            .unwrap();

        let insert_both = sqlx::query(
            "INSERT INTO sources (id, case_id, title, reference_source_id, reference_meta_source_id) \
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
            "UPDATE sources SET reference_source_id = 's1', reference_meta_source_id = 'm1' WHERE id = 's2'",
        )
        .execute(&pool)
        .await;
        assert!(update_both.is_err(), "update trigger must fire");
    }

    #[tokio::test]
    async fn meta_source_ratings_are_constrained() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("INSERT INTO meta_sources (id, name, reliability_code, credibility_code) VALUES ('ok', 'Reuters', 'A', 1)")
            .execute(&pool)
            .await
            .expect("valid rating must be accepted");

        assert!(sqlx::query("INSERT INTO meta_sources (id, name, reliability_code) VALUES ('bad1', 'X', 'G')")
            .execute(&pool)
            .await
            .is_err());
        assert!(sqlx::query("INSERT INTO meta_sources (id, name, credibility_code) VALUES ('bad2', 'X', 7)")
            .execute(&pool)
            .await
            .is_err());
        assert!(sqlx::query("INSERT INTO meta_sources (id, name, kind) VALUES ('bad3', 'X', 'robot')")
            .execute(&pool)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn deleting_a_referenced_source_clears_the_link_only() {
        let pool = fresh_pool().await;
        apply_all(&pool).await;

        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
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

        sqlx::query("UPDATE sources SET reference_source_id = NULL WHERE reference_source_id = 'core'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM sources WHERE id = 'core'")
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query("SELECT reference_source_id, reliability_code FROM sources WHERE id = 'echo'")
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
            let found: Option<String> =
                sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
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
        sqlx::query("INSERT INTO quality_source_refs (id, quality_id, source_id) VALUES ('r1', 'q1', 's1')")
            .execute(&pool)
            .await
            .unwrap();

        // Deleting the entity should cascade-delete its qualities and source refs.
        sqlx::query("DELETE FROM entities WHERE id = 'e1'")
            .execute(&pool)
            .await
            .unwrap();

        let quality_count: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM entity_qualities WHERE entity_id = 'e1'")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(quality_count, Some(0), "qualities should cascade on entity delete");

        let ref_count: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM quality_source_refs WHERE quality_id = 'q1'")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(ref_count, Some(0), "source refs should cascade on quality delete");
    }
}
