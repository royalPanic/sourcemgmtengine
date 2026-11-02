use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool};
use sqlx::sqlite::SqlitePool;

use crate::database::connection::DB_URL;

/// Returns the SQLite pool the SQL plugin opened for this application.
pub async fn pool(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;

    match guard.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Database has not been loaded".to_string()),
    }
}