mod commands;
mod database;
mod models;
mod opentimestamps;
mod validation;

// Entity type templates embedded at compile time by build.rs.
mod entity_types {
    include!(concat!(env!("OUT_DIR"), "/entity_types.rs"));
}

#[cfg(test)]
mod patch_tests;

#[cfg(test)]
mod validation_tests;

#[cfg(test)]
mod rating_tests;

#[cfg(test)]
mod rating_sql_tests;

#[cfg(test)]
mod reference_tests;

#[cfg(test)]
mod migration_tests;

#[cfg(test)]
mod download_tests;

use commands::{cases, entities, files, meta_sources, sources};
use database::connection::init_sql_plugin;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(init_sql_plugin())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            cases::create_case,
            cases::get_cases,
            cases::get_case,
            cases::update_case,
            cases::delete_case,
            cases::get_case_note,
            cases::update_case_note,
            sources::create_source,
            sources::get_sources,
            sources::get_source,
            sources::update_source,
            sources::delete_source,
            sources::add_source_attachment,
            sources::delete_source_attachment,
            meta_sources::create_meta_source,
            meta_sources::get_meta_sources,
            meta_sources::update_meta_source,
            meta_sources::delete_meta_source,
            entities::get_entity_types,
            entities::create_entity,
            entities::get_entities,
            entities::get_entity,
            entities::update_entity,
            entities::delete_entity,
            entities::create_entity_quality,
            entities::get_entity_qualities,
            entities::update_entity_quality,
            entities::delete_entity_quality,
            entities::add_quality_source_ref,
            entities::remove_quality_source_ref,
            entities::get_quality_source_refs,
            files::save_attachment,
            files::import_attachment,
            files::download_media,
            files::timestamp_attachment,
            files::verify_timestamp,
            files::get_timestamp_status,
            files::read_attachment,
            files::delete_attachment_file,
            files::open_attachment,
            files::get_attachment_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
