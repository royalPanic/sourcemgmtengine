//! Verifies which entities a container view receives.
//!
//! A global entity belongs to no container (`case_id IS NULL`), so filtering a
//! container view by `case_id` alone hides every global entity — which reads as
//! "entities were discarded after restart". These tests pin the visibility
//! rules against the query the production code builds, and run it on a real
//! SQLite database seeded with one global and one case-specific entity.

#[cfg(test)]
mod tests {
    use crate::commands::entities::build_entities_query;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    const SCHEMA: &str = r#"
        CREATE TABLE entities (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            case_id TEXT,
            is_global INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    "#;

    async fn seeded_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory database");

        sqlx::query(SCHEMA).execute(&pool).await.expect("create schema");

        // Two containers, one global entity, and one entity per container.
        for (id, name, is_global, case_id) in [
            ("g1", "Global Wire", 1i64, None),
            ("c1", "Case One Local", 0i64, Some("case-a")),
            ("c2", "Case Two Local", 0i64, Some("case-b")),
            ("g2", "Another Global", 1i64, None),
        ] {
            sqlx::query(
                "INSERT INTO entities (id, entity_type, name, case_id, is_global) \
                 VALUES (?, 'organization', ?, ?, ?)",
            )
            .bind(id)
            .bind(name)
            .bind(case_id)
            .bind(is_global)
            .execute(&pool)
            .await
            .expect("insert entity");
        }

        pool
    }

    async fn names(pool: &sqlx::SqlitePool, case_id: Option<&str>, is_global: Option<bool>) -> Vec<String> {
        let (query, params) = build_entities_query(case_id, is_global);
        let mut statement = sqlx::query(&query);
        for param in &params {
            statement = statement.bind(param);
        }
        statement
            .fetch_all(pool)
            .await
            .expect("query entities")
            .into_iter()
            .map(|row| row.get::<String, _>("name"))
            .collect()
    }

    #[tokio::test]
    async fn a_container_view_includes_global_entities() {
        let pool = seeded_pool().await;

        // This is the exact shape the Entities panel uses: a container with no
        // explicit is_global filter.
        let result = names(&pool, Some("case-a"), None).await;

        assert_eq!(
            result,
            vec!["Another Global", "Case One Local", "Global Wire"],
            "globals must remain visible inside a container"
        );
    }

    #[tokio::test]
    async fn a_container_view_excludes_other_containers_entities() {
        let pool = seeded_pool().await;

        let result = names(&pool, Some("case-a"), None).await;

        assert!(
            !result.contains(&"Case Two Local".to_string()),
            "entities from another container must not leak in"
        );
    }

    #[tokio::test]
    async fn global_only_lookup_is_restart_safe() {
        let pool = seeded_pool().await;

        // The startup/pre-selection view asks for globals only, and must not
        // be narrowed by a container that is not selected yet.
        let result = names(&pool, None, Some(true)).await;
        assert_eq!(result, vec!["Another Global", "Global Wire"]);

        // Even if a container id is supplied, the global set is unchanged.
        let with_case = names(&pool, Some("case-a"), Some(true)).await;
        assert_eq!(with_case, vec!["Another Global", "Global Wire"]);
    }

    #[tokio::test]
    async fn case_specific_lookup_excludes_globals() {
        let pool = seeded_pool().await;

        let result = names(&pool, Some("case-a"), Some(false)).await;

        assert_eq!(result, vec!["Case One Local"]);
    }

    #[tokio::test]
    async fn a_no_container_startup_returns_every_entity() {
        let pool = seeded_pool().await;

        // Nothing is selected after a restart, so the app asks with no filters.
        // Case-specific entities must still be listed; the previous regression
        // forced `is_global = true` here and they vanished from every view.
        let result = names(&pool, None, None).await;

        assert!(result.contains(&"Case One Local".to_string()));
        assert!(result.contains(&"Case Two Local".to_string()));
        assert_eq!(result.len(), 4);
    }

    #[tokio::test]
    async fn a_container_view_includes_case_specific_entities() {
        let pool = seeded_pool().await;

        // The workspace "Entities" tab and the reference picker share one list
        // with the Entities panel. An earlier build passed `is_global = true`
        // for those views, which hid every case-specific entity.
        let result = names(&pool, Some("case-a"), None).await;

        assert!(
            result.contains(&"Case One Local".to_string()),
            "case-specific entities must appear inside their own container"
        );
    }

    #[tokio::test]
    async fn an_unfiltered_lookup_returns_everything() {
        let pool = seeded_pool().await;

        let result = names(&pool, None, None).await;

        assert_eq!(result.len(), 4);
    }

    #[tokio::test]
    async fn a_container_id_cannot_inject_sql() {
        let pool = seeded_pool().await;

        // The value is bound as a parameter, so it is data, not SQL.
        let result = names(&pool, Some("' OR 1=1 --"), None).await;

        assert_eq!(
            result,
            vec!["Another Global", "Global Wire"],
            "only global entities should match an unmatched container id"
        );
    }
}
