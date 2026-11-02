use tauri::plugin::TauriPlugin;
use tauri::Runtime;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, PluginConfig};

use crate::database::migrations::get_migrations;

/// Connection string registered with the SQL plugin. The plugin resolves this
/// to `<app_config_dir>/osint_case_manager.db`.
pub const DB_URL: &str = "sqlite:osint_case_manager.db";

pub fn init_sql_plugin<R: Runtime>() -> TauriPlugin<R, Option<PluginConfig>> {
    let migrations: Vec<Migration> = get_migrations();

    SqlBuilder::new()
        .add_migrations(DB_URL, migrations)
        .build()
}