use sqlx::sqlite::SqlitePool;
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::database::connection::DB_URL;

/// Returns the SQLite pool the SQL plugin opened for this application.
///
/// SQLx enables SQLite foreign-key enforcement on every connection by default,
/// so the plugin's pool can be used directly.
pub async fn pool(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;

    match guard.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Database has not been loaded".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    /// A pool built the way the plugin builds one, without a custom hook.
    async fn plugin_style_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(4)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite")
    }

    #[tokio::test]
    async fn foreign_keys_are_enabled_on_each_sqlx_connection() {
        let pool = plugin_style_pool().await;
        let mut connections = Vec::new();
        for _ in 0..4 {
            connections.push(pool.acquire().await.expect("pool connection"));
        }

        for connection in &mut connections {
            let value: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&mut **connection)
                .await
                .expect("pragma read");
            assert_eq!(
                value, 1,
                "every SQLite connection must enforce foreign keys"
            );
        }
    }

    #[tokio::test]
    async fn cascade_delete_works_through_the_plugin_style_pool() {
        let pool = plugin_style_pool().await;

        sqlx::query(
            "CREATE TABLE parent (id TEXT PRIMARY KEY);
             CREATE TABLE child (
                 id TEXT PRIMARY KEY,
                 parent_id TEXT NOT NULL,
                 FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE
             );",
        )
        .execute(&pool)
        .await
        .expect("schema");

        sqlx::query("INSERT INTO parent (id) VALUES ('p1')")
            .execute(&pool)
            .await
            .expect("parent insert");
        sqlx::query("INSERT INTO child (id, parent_id) VALUES ('c1', 'p1')")
            .execute(&pool)
            .await
            .expect("child insert");

        sqlx::query("DELETE FROM parent WHERE id = 'p1'")
            .execute(&pool)
            .await
            .expect("parent delete");

        let remaining: Option<String> = sqlx::query_scalar("SELECT id FROM child WHERE id = 'c1'")
            .fetch_optional(&pool)
            .await
            .expect("child read");
        assert!(
            remaining.is_none(),
            "the child row must be removed by ON DELETE CASCADE"
        );
    }
}
