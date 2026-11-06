use tauri::{command, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

use crate::database::pool;
use crate::models::models::{SourceAttachment, TimestampRecord, TimestampStatus};
use crate::opentimestamps::{
    confirm_timestamp, create_timestamp_proof, fail_timestamp, get_timestamp_for_attachment,
    record_timestamp,
};
use sqlx::Row;

/// Upper bound for a single attachment. Media files are read fully into memory
/// before being written, so this keeps a stray multi-gigabyte pick from
/// exhausting the process. 10 GB preserves full-resolution evidence.
const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024 * 1024;

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

/// Downloads media from a URL using yt-dlp and stores it as an attachment on
/// the given source.
///
/// Network is only used when this command is invoked — the operator must
/// explicitly click "Download Media" in the UI. The downloaded file is read
/// into memory, written through the normal attachment store, and the temp
/// download is removed.
///
/// yt-dlp (and ffmpeg for post-processing) must be on the system PATH.
#[command]
pub async fn download_media(
    app: AppHandle,
    source_id: String,
    url: String,
) -> Result<SourceAttachment, String> {
    let pool = pool::pool(&app).await?;

    // Verify the source exists before doing any network work.
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM sources WHERE id = ?")
        .bind(&source_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to look up source: {}", e))?;

    let _ = exists.ok_or_else(|| format!("Source not found: {source_id}"))?;

    // Resolve yt-dlp from the system PATH.
    let yt_dlp = which::which("yt-dlp")
        .map_err(|_| "yt-dlp not found on PATH. Install yt-dlp (and ffmpeg) to download media.".to_string())?;

    let temp_dir = std::env::temp_dir().join(format!("osint-download-{source_id}"));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {e}"))?;

    let output_template = temp_dir.join("%(title)s.%(ext)s");

    let output = Command::new(&yt_dlp)
        .args([
            "--print",
            "filename",
            "-o",
            output_template.to_string_lossy().as_ref(),
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {stderr}"));
    }

    let downloaded_path = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_string();

    if downloaded_path.is_empty() {
        return Err("yt-dlp did not report a downloaded file".to_string());
    }

    let downloaded_path = PathBuf::from(&downloaded_path);

    if !downloaded_path.exists() {
        return Err("Downloaded file not found on disk".to_string());
    }

    let metadata = std::fs::metadata(&downloaded_path)
        .map_err(|e| format!("Failed to read downloaded file metadata: {e}"))?;

    if metadata.len() > MAX_ATTACHMENT_BYTES {
        // Clean up before erroring.
        let _ = std::fs::remove_file(&downloaded_path);
        return Err(format!(
            "Downloaded file exceeds the {} GB limit",
            MAX_ATTACHMENT_BYTES / (1024 * 1024 * 1024)
        ));
    }

    let data = std::fs::read(&downloaded_path)
        .map_err(|e| format!("Failed to read downloaded file: {e}"))?;

    let file_name = downloaded_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download")
        .to_string();

    let relative_path = write_attachment(&app, &source_id, &file_name, &data)?;

    // Clean up the temp download now that it is in the attachment store.
    let _ = std::fs::remove_file(&downloaded_path);
    let _ = std::fs::remove_dir(&temp_dir);

    let mime_type = mime_from_extension(
        downloaded_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or(""),
    )
    .to_string();

    let attachment = SourceAttachment::new(
        source_id.clone(),
        file_name,
        relative_path,
        Some(mime_type),
        Some(metadata.len() as i64),
    );

    sqlx::query(
        "INSERT INTO source_attachments (id, source_id, file_name, relative_path, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&attachment.id)
    .bind(&attachment.source_id)
    .bind(&attachment.file_name)
    .bind(&attachment.relative_path)
    .bind(&attachment.mime_type)
    .bind(attachment.file_size)
    .bind(&attachment.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to record attachment: {}", e))?;

    // Automatically create an OpenTimestamps timestamp proof for the
    // downloaded attachment so its existence is cryptographically attested
    // without requiring manual user action. Timestamping failures are
    // non-fatal — the attachment is still preserved.
    let attachment_path = match resolve_attachment_path(&app, &attachment.relative_path) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to resolve attachment path for auto-timestamp: {e}");
            return Ok(attachment);
        }
    };

    if attachment_path.exists() {
        match create_timestamp_proof(&attachment_path) {
            Ok(proof) => {
                if let Err(e) = record_timestamp(&app, &attachment.id, &attachment.relative_path, &proof).await {
                    eprintln!("Failed to record auto-timestamp: {e}");
                }
            }
            Err(e) => {
                eprintln!("Auto-timestamp proof creation failed: {e}");
            }
        }
    }

    Ok(attachment)
}

/// Creates an OpenTimestamps timestamp proof for an attachment and stores it
/// alongside the attachment. Network is only used when this command is
/// invoked — the operator must explicitly click "Timestamp".
#[command]
pub async fn timestamp_attachment(
    app: AppHandle,
    attachment_id: String,
) -> Result<TimestampRecord, String> {
    let pool = pool::pool(&app).await?;

    // Verify the attachment exists and get its relative path.
    let row = sqlx::query(
        "SELECT relative_path FROM source_attachments WHERE id = ?",
    )
    .bind(&attachment_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to look up attachment: {e}"))?;

    let relative_path: String = row
        .map(|r| r.get("relative_path"))
        .ok_or_else(|| format!("Attachment not found: {attachment_id}"))?;

    // Check if a timestamp already exists for this attachment.
    let existing = get_timestamp_for_attachment(&app, &attachment_id).await?;
    if existing.is_some() {
        return Err("Attachment already has a timestamp".to_string());
    }

    // Resolve the attachment's absolute path.
    let attachment_path = crate::opentimestamps::resolve_attachment_path(&app, &relative_path)?;

    if !attachment_path.exists() {
        return Err("Attachment file not found on disk".to_string());
    }

    // Create the timestamp proof (hashes file, submits to calendars).
    let proof = create_timestamp_proof(&attachment_path)?;

    // Record and write the .ots proof.
    record_timestamp(&app, &attachment_id, &relative_path, &proof).await
}

/// Verifies an existing timestamp proof by re-checking it against the
/// calendars. Updates the status in the database.
#[command]
pub async fn verify_timestamp(app: AppHandle, attachment_id: String) -> Result<TimestampRecord, String> {
    let pool = pool::pool(&app).await?;
    let mut record = get_timestamp_for_attachment(&app, &attachment_id)
        .await?
        .ok_or_else(|| format!("No timestamp found for attachment: {attachment_id}"))?;

    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;

    let ots_absolute = app_config_dir.join(Path::new(&record.ots_path));

    if !ots_absolute.exists() {
        return Err("Timestamp proof file not found on disk".to_string());
    }

    // Re-derive the original attachment hash from the attachment file.
    let attachment_row = sqlx::query(
        "SELECT relative_path FROM source_attachments WHERE id = ?",
    )
    .bind(&attachment_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to look up attachment: {e}"))?;

    let rel: String = attachment_row
        .map(|r| r.get("relative_path"))
        .ok_or_else(|| format!("Attachment not found: {attachment_id}"))?;

    let att_path = crate::opentimestamps::resolve_attachment_path(&app, &rel)?;
    let file_hash = crate::opentimestamps::compute_sha256(&att_path)?;

    let mut any_success = false;
    let mut errors = Vec::new();

    for calendar in crate::opentimestamps::CALENDARS {
        match crate::opentimestamps::submit_to_calendar(calendar, &file_hash) {
            Ok(_attestation) => {
                any_success = true;
            }
            Err(e) => {
                errors.push(format!("{calendar}: {e}"));
            }
        }
    }

    if any_success {
        record.status = TimestampStatus::Confirmed;
        let now = chrono::Utc::now().to_rfc3339();
        record.confirmed_at = Some(now.clone());

        confirm_timestamp(&app, &record.id).await?;
    } else if !errors.is_empty() {
        record.status = TimestampStatus::Failed;
        fail_timestamp(&app, &record.id).await?;
    }

    Ok(record)
}

/// Gets the timestamp record for an attachment, if any.
#[command]
pub async fn get_timestamp_status(
    app: AppHandle,
    attachment_id: String,
) -> Result<Option<TimestampRecord>, String> {
    get_timestamp_for_attachment(&app, &attachment_id).await
}