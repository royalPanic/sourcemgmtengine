use tauri::{command, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

/// Resolves a stored relative path against the app data directory, rejecting
/// any path that escapes it (absolute paths, `..`, drive prefixes, etc.).
fn resolve_attachment_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let candidate = Path::new(relative_path);

    if candidate.is_absolute() {
        return Err("Attachment path must be relative".to_string());
    }

    let mut resolved = app_data_dir.clone();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => resolved.push(part),
            Component::CurDir => {}
            _ => return Err("Attachment path contains invalid components".to_string()),
        }
    }

    // Defence in depth: the canonical parent must stay inside the app data dir.
    let parent = resolved
        .parent()
        .ok_or_else(|| "Attachment path has no parent directory".to_string())?;
    if let (Ok(canonical_parent), Ok(canonical_root)) =
        (parent.canonicalize(), app_data_dir.canonicalize())
    {
        if !canonical_parent.starts_with(&canonical_root) {
            return Err("Attachment path escapes the app data directory".to_string());
        }
    }

    Ok(resolved)
}

/// Strips directory separators and control characters from a user-supplied file name.
fn sanitize_file_name(file_name: &str) -> String {
    let base = Path::new(file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != '/' && *c != '\\')
        .collect();

    if cleaned.trim().is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

#[command]
pub async fn save_attachment(
    app: AppHandle,
    source_id: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let safe_source_id = sanitize_file_name(&source_id);
    let safe_file_name = sanitize_file_name(&file_name);

    let attachments_dir = app_data_dir.join("attachments").join(&safe_source_id);
    std::fs::create_dir_all(&attachments_dir)
        .map_err(|e| format!("Failed to create attachments dir: {}", e))?;

    let extension = PathBuf::from(&safe_file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let stem = PathBuf::from(&safe_file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    let unique_name = if extension.is_empty() {
        format!("{}_{}", Uuid::new_v4(), stem)
    } else {
        format!("{}_{}.{}", Uuid::new_v4(), stem, extension)
    };

    let file_path = attachments_dir.join(&unique_name);
    let relative_path = format!("attachments/{}/{}", safe_source_id, unique_name);

    std::fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(relative_path)
}

#[command]
pub async fn read_attachment(app: AppHandle, relative_path: String) -> Result<Vec<u8>, String> {
    let file_path = resolve_attachment_path(&app, &relative_path)?;

    std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
pub async fn delete_attachment_file(app: AppHandle, relative_path: String) -> Result<(), String> {
    let file_path = resolve_attachment_path(&app, &relative_path)?;

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[command]
pub async fn open_attachment(app: AppHandle, relative_path: String) -> Result<(), String> {
    let file_path = resolve_attachment_path(&app, &relative_path)?;

    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    // Use the opener plugin rather than shelling out, so the path is never
    // interpolated into a command line.
    app.opener()
        .open_path(file_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open file: {}", e))
}

#[command]
pub async fn get_attachment_path(app: AppHandle, relative_path: String) -> Result<String, String> {
    let file_path = resolve_attachment_path(&app, &relative_path)?;

    Ok(file_path.to_string_lossy().to_string())
}