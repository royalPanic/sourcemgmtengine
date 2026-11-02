use tauri::{command, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

/// Upper bound for a single attachment. Media files are read fully into memory
/// before being written, so this keeps a stray multi-gigabyte pick from
/// exhausting the process.
const MAX_ATTACHMENT_BYTES: u64 = 512 * 1024 * 1024;

/// Resolves a stored relative path against the app config directory, rejecting
/// any path that escapes it (absolute paths, `..`, drive prefixes, etc.).
///
/// The SQL plugin stores its database in `app_config_dir`, so attachments live
/// alongside it and the asset-protocol scope (`$APPCONFIG/attachments/**`)
/// covers exactly this tree.
fn resolve_attachment_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;

    let candidate = Path::new(relative_path);

    if candidate.is_absolute() {
        return Err("Attachment path must be relative".to_string());
    }

    let mut resolved = app_config_dir.clone();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => resolved.push(part),
            Component::CurDir => {}
            _ => return Err("Attachment path contains invalid components".to_string()),
        }
    }

    // Defence in depth: the canonical parent must stay inside the app config dir.
    let parent = resolved
        .parent()
        .ok_or_else(|| "Attachment path has no parent directory".to_string())?;
    if let (Ok(canonical_parent), Ok(canonical_root)) =
        (parent.canonicalize(), app_config_dir.canonicalize())
    {
        if !canonical_parent.starts_with(&canonical_root) {
            return Err("Attachment path escapes the app config directory".to_string());
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

/// Maps a file extension to a MIME type. Used when the caller cannot supply one
/// (for example when importing a file straight from disk).
fn mime_from_extension(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "tif" | "tiff" => "image/tiff",
        "mp4" => "video/mp4",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "csv" => "text/csv",
        "html" | "htm" => "text/html",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// Writes `data` into `attachments/<source_id>/` and returns the relative path.
fn write_attachment(
    app: &AppHandle,
    source_id: &str,
    file_name: &str,
    data: &[u8],
) -> Result<String, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;

    let safe_source_id = sanitize_file_name(source_id);
    let safe_file_name = sanitize_file_name(file_name);

    let attachments_dir = app_config_dir.join("attachments").join(&safe_source_id);
    std::fs::create_dir_all(&attachments_dir)
        .map_err(|e| format!("Failed to create attachments dir: {}", e))?;

    let path = PathBuf::from(&safe_file_name);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();
    let stem = path
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

    std::fs::write(&file_path, data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(relative_path)
}

#[command]
pub async fn save_attachment(
    app: AppHandle,
    source_id: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    if data.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "Attachment exceeds the {} MB limit",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }

    write_attachment(&app, &source_id, &file_name, &data)
}

/// Copies a file the user picked on disk into the app's attachment store.
///
/// The frontend uses the dialog plugin to obtain an absolute path, then hands it
/// here. Reading happens in Rust so the file never has to be marshalled through
/// the webview as a byte array.
#[command]
pub async fn import_attachment(
    app: AppHandle,
    source_id: String,
    source_path: String,
) -> Result<ImportedAttachment, String> {
    let path = PathBuf::from(&source_path);

    if !path.is_file() {
        return Err("Selected path is not a file".to_string());
    }

    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "Attachment exceeds the {} MB limit",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_string())
        .ok_or_else(|| "Selected file has no valid name".to_string())?;

    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let relative_path = write_attachment(&app, &source_id, &file_name, &data)?;

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    Ok(ImportedAttachment {
        file_name,
        relative_path,
        mime_type: mime_from_extension(extension).to_string(),
        file_size: metadata.len() as i64,
    })
}

#[derive(serde::Serialize)]
pub struct ImportedAttachment {
    pub file_name: String,
    pub relative_path: String,
    pub mime_type: String,
    pub file_size: i64,
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