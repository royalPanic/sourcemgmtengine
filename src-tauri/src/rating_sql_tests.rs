//! Exercises the rating patch against a real SQLite database built from the
//! production schema, so the CHECK constraints are actually in play.
//!
//! The unit tests in `rating_tests` cover the patch helpers in isolation; this
//! covers the thing that actually broke: binding `""` or `0` into a column
//! guarded by `CHECK (reliability_code IN ('A'..'F'))`.

#[cfg(test)]
mod tests {
    use crate::validation::{patch_optional, patch_optional_int};
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    /// The rating columns exactly as `migrations.rs` declares them.
    const SCHEMA: &str = r#"
        CREATE TABLE sources (
            id TEXT PRIMARY KEY,
            reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
            credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6)
        );
    "#;

    async fn pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite");
        sqlx::query(SCHEMA).execute(&pool).await.expect("schema");
        pool
    }

    /// Mirrors the UPDATE that `update_source` builds.
    async fn apply_patch(
        pool: &sqlx::SqlitePool,
        id: &str,
        reliability: Option<String>,
        credibility: Option<i32>,
    ) -> Result<(), sqlx::Error> {
        let reliability = patch_optional(reliability);
        let credibility = patch_optional_int(credibility);

        let mut sets: Vec<&str> = Vec::new();
        if reliability.is_some() {
            sets.push("reliability_code = ?");
        }
        if credibility.is_some() {
            sets.push("credibility_code = ?");
        }
        if sets.is_empty() {
            return Ok(());
        }

        let query = format!("UPDATE sources SET {} WHERE id = ?", sets.join(", "));
        let mut statement = sqlx::query(&query);
        if let Some(value) = reliability {
            statement = statement.bind(value);
        }
        if let Some(value) = credibility {
            statement = statement.bind(value);
        }
        statement.bind(id).execute(pool).await.map(|_| ())
    }

    async fn ratings(pool: &sqlx::SqlitePool, id: &str) -> (Option<String>, Option<i32>) {
        let row = sqlx::query("SELECT reliability_code, credibility_code FROM sources WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("row");
        (row.get(0), row.get(1))
    }

    #[tokio::test]
    async fn unrated_source_can_be_saved_without_ratings() {
        // The reported bug: editing an unrated source failed because the
        // frontend sent "" and 0, which the CHECK constraints reject.
        let pool = pool().await;
        sqlx::query("INSERT INTO sources (id, reliability_code, credibility_code) VALUES ('s1', NULL, NULL)")
            .execute(&pool)
            .await
            .unwrap();

        apply_patch(&pool, "s1", Some(String::new()), Some(0))
            .await
            .expect("saving an unrated source must succeed");

        assert_eq!(ratings(&pool, "s1").await, (None, None));
    }

    #[tokio::test]
    async fn ratings_can_be_set_and_cleared() {
        let pool = pool().await;
        sqlx::query("INSERT INTO sources (id, reliability_code, credibility_code) VALUES ('s1', NULL, NULL)")
            .execute(&pool)
            .await
            .unwrap();

        apply_patch(&pool, "s1", Some("A".into()), Some(1)).await.unwrap();
        assert_eq!(ratings(&pool, "s1").await, (Some("A".into()), Some(1)));

        apply_patch(&pool, "s1", Some(String::new()), Some(0)).await.unwrap();
        assert_eq!(ratings(&pool, "s1").await, (None, None));
    }

    #[tokio::test]
    async fn clearing_one_rating_leaves_the_other() {
        let pool = pool().await;
        sqlx::query("INSERT INTO sources (id, reliability_code, credibility_code) VALUES ('s1', 'B', 2)")
            .execute(&pool)
            .await
            .unwrap();

        apply_patch(&pool, "s1", Some(String::new()), None).await.unwrap();
        assert_eq!(ratings(&pool, "s1").await, (None, Some(2)));

        apply_patch(&pool, "s1", None, Some(0)).await.unwrap();
        assert_eq!(ratings(&pool, "s1").await, (None, None));
    }

    #[tokio::test]
    async fn omitting_ratings_preserves_them() {
        let pool = pool().await;
        sqlx::query("INSERT INTO sources (id, reliability_code, credibility_code) VALUES ('s1', 'C', 3)")
            .execute(&pool)
            .await
            .unwrap();

        apply_patch(&pool, "s1", None, None).await.unwrap();
        assert_eq!(ratings(&pool, "s1").await, (Some("C".into()), Some(3)));
    }

    #[tokio::test]
    async fn invalid_ratings_are_rejected_by_the_schema() {
        // Confirms the CHECK constraints are real, so the validation added in
        // `validation.rs` is guarding something that would otherwise fail.
        let pool = pool().await;
        sqlx::query("INSERT INTO sources (id, reliability_code, credibility_code) VALUES ('s1', NULL, NULL)")
            .execute(&pool)
            .await
            .unwrap();

        assert!(apply_patch(&pool, "s1", Some("G".into()), None).await.is_err());
        assert!(apply_patch(&pool, "s1", None, Some(7)).await.is_err());
        assert!(apply_patch(&pool, "s1", Some("a".into()), None).await.is_err());
    }
}
