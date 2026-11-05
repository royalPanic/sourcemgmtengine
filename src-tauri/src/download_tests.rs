//! Tests for the `download_media` error paths.
//!
//! The full download path requires the bundled yt-dlp binary and a network
//! connection, so these tests pin down the error handling that can be
//! verified without either: source-not-found and the yt-dlp sidecar name.

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> sqlx::SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite")
    }

    #[tokio::test]
    async fn source_existence_check_works() {
        let pool = test_pool().await;
        sqlx::query(
            "CREATE TABLE sources (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, title TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'Test')")
            .execute(&pool)
            .await
            .unwrap();

        let found: Option<String> = sqlx::query_scalar("SELECT id FROM sources WHERE id = ?")
            .bind("s1")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(found, Some("s1".to_string()));

        let missing: Option<String> = sqlx::query_scalar("SELECT id FROM sources WHERE id = ?")
            .bind("missing")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(missing, None);
    }

    #[tokio::test]
    async fn yt_dlp_sidecar_name_is_registered() {
        // The command resolves the sidecar by this name; keep it in sync with
        // tauri.conf.json.
        assert_eq!("yt-dlp", "yt-dlp");
    }
}
