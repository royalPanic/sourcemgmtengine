use tauri::{command, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use url::Url;
use uuid::Uuid;

use crate::database::pool;
use crate::models::models::{SourceAttachment, TimestampRecord, TimestampStatus};
use crate::opentimestamps::{
    confirm_timestamp, create_timestamp_proof, get_timestamp_for_attachment, record_timestamp,
    upgrade_proof, verify_proof,
};
use sqlx::Row;

/// Upper bound for a single attachment. Downloads are streamed straight to
/// disk, but the cap still bounds how much evidence a single pick can pull in.
/// 10 GB preserves full-resolution evidence.
const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024 * 1024;

/// Upper bound for an HTML page fetched while looking for an image. Pages only
/// need to be large enough to contain their metadata and `<img>` tags.
const MAX_HTML_BYTES: u64 = 2 * 1024 * 1024;

/// Many hosts reject requests without a browser-like user agent, so a plain
/// HTTP download sends one rather than the default library string.
const DOWNLOAD_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
     AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/// Human-readable form of [`MAX_ATTACHMENT_BYTES`] for error messages.
fn max_attachment_label() -> String {
    format!("{} GB", MAX_ATTACHMENT_BYTES / (1024 * 1024 * 1024))
}

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
    let file_path = allocate_attachment_path(app, source_id, file_name)?;

    std::fs::write(&file_path.absolute, data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(file_path.relative)
}

/// A resolved destination inside the attachment store.
struct AttachmentDestination {
    absolute: PathBuf,
    relative: String,
}

/// Creates `attachments/<source_id>/` and picks a unique file name.
///
/// Split out from [`write_attachment`] so a file already on disk can be copied
/// in without first being loaded into memory.
fn allocate_attachment_path(
    app: &AppHandle,
    source_id: &str,
    file_name: &str,
) -> Result<AttachmentDestination, String> {
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

    Ok(AttachmentDestination {
        absolute: attachments_dir.join(&unique_name),
        relative: format!("attachments/{}/{}", safe_source_id, unique_name),
    })
}

/// Copies a file already on disk into the attachment store.
///
/// Copying avoids reading the whole file into memory, which matters because
/// video evidence can be many gigabytes and the per-attachment limit is
/// generous.
fn copy_attachment(
    app: &AppHandle,
    source_id: &str,
    file_name: &str,
    source_path: &Path,
) -> Result<AttachmentDestination, String> {
    let destination = allocate_attachment_path(app, source_id, file_name)?;

    std::fs::copy(source_path, &destination.absolute)
        .map_err(|e| format!("Failed to copy file into attachment store: {}", e))?;

    Ok(destination)
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
            "Attachment exceeds the {} limit",
            max_attachment_label()
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
            "Attachment exceeds the {} limit",
            max_attachment_label()
        ));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_string())
        .ok_or_else(|| "Selected file has no valid name".to_string())?;

    // Copy on disk rather than reading the file into memory: a large video
    // would otherwise be buffered whole before being written straight back out.
    let destination = copy_attachment(&app, &source_id, &file_name, &path)?;

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    Ok(ImportedAttachment {
        file_name,
        relative_path: destination.relative,
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

    // Remove the OpenTimestamps proof too, so deleting evidence does not leave
    // an orphaned .ots file behind. The database row cascades on its own.
    let ots_relative = crate::opentimestamps::ots_path_for_attachment(&relative_path);
    if let Ok(ots_path) = resolve_attachment_path(&app, &ots_relative) {
        if ots_path.exists() {
            let _ = std::fs::remove_file(&ots_path);
        }
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

/// Locates the `yt-dlp` executable.
///
/// Release bundles ship a `yt-dlp` sidecar next to the app binary, so that is
/// preferred when present. A developer or operator who has yt-dlp installed on
/// the system `PATH` is supported too, which keeps `tauri dev` working without
/// staging a sidecar first.
fn find_yt_dlp(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = sidecar_yt_dlp(app) {
        return Ok(path);
    }

    if let Ok(path) = which::which("yt-dlp") {
        return Ok(path);
    }

    Err(
        "yt-dlp not found. The app ships a bundled yt-dlp sidecar; if you are running \
         from source, install yt-dlp and make sure it resolves on PATH (for example \
         `pip install yt-dlp` or `winget install yt-dlp`). ffmpeg is also needed to \
         merge separate video and audio streams."
            .to_string(),
    )
}

/// Returns the bundled `yt-dlp` sidecar if it exists on disk.
///
/// Tauri copies the staged `binaries/yt-dlp-<triple>` into the bundle output
/// under its plain name (`yt-dlp.exe`), while some layouts keep the triple
/// suffix. Both are checked so a packaged app and a local `--no-bundle` build
/// resolve the same way. Resolving the path directly rather than through
/// `tauri::process::Command::new_sidecar` keeps a system `PATH` copy usable as
/// a fallback and avoids panic-on-missing behaviour.
fn sidecar_yt_dlp(_app: &AppHandle) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    let current = std::env::current_exe().ok()?;
    let dir = current.parent()?;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Bundled sidecars are staged with the target triple suffix.
    if let Some(target) = option_env!("TARGET") {
        let stem = exe_name.trim_end_matches(".exe");
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        candidates.push(dir.join(format!("{stem}-{target}{suffix}")));
    }

    // The name Tauri actually ships in the bundle output.
    candidates.push(dir.join(exe_name));

    candidates.into_iter().find(|candidate| candidate.is_file())
}

/// Extracts the downloaded file path from yt-dlp's `--print` output.
///
/// `--print` emits one line per produced file (and some warnings go to stdout
/// on certain platforms), so the last non-empty line is the final artefact.
pub(crate) fn parse_reported_path(stdout: &str) -> Option<PathBuf> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .last()
        .map(PathBuf::from)
}

/// Builds the yt-dlp argument list for a download.
///
/// `--print` alone implies `--simulate`, which only reports a filename and
/// fetches nothing — the original cause of "Download Media" producing no file.
/// `--no-simulate` keeps the print while performing the actual download, and
/// `after_move:filepath` reports the path only once post-processing has
/// finished, so the returned path always exists on disk.
pub(crate) fn yt_dlp_args(url: &str, output_template: &str) -> Vec<String> {
    vec![
        "--no-simulate".to_string(),
        "--print".to_string(),
        "after_move:filepath".to_string(),
        // Prefer a mergeable video+audio pair so the result is playable, and
        // fall back to the best single file when no merge is possible.
        "-f".to_string(),
        "bv*+ba/b".to_string(),
        "--no-playlist".to_string(),
        "--restrict-filenames".to_string(),
        "-o".to_string(),
        output_template.to_string(),
        url.to_string(),
    ]
}

/// What a URL points at, as far as downloading is concerned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum UrlKind {
    /// A direct link to a file; fetch it with a plain HTTP GET.
    DirectFile,
    /// An HTML page; yt-dlp may be able to extract media from it.
    WebPage,
}

/// Classifies a URL by the file extension in its final path segment.
///
/// Image and video extensions are handled here rather than by yt-dlp: yt-dlp is
/// a video-site extractor, and while it happens to pass a direct image through
/// its generic extractor, it refuses an HTML page on a site it does not know.
/// A plain GET covers the direct case and gives a much clearer error when a
/// page cannot be resolved.
pub(crate) fn classify_url(raw: &str) -> Result<UrlKind, String> {
    let url = Url::parse(raw).map_err(|e| format!("Invalid URL \"{raw}\": {e}"))?;

    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "Unsupported URL scheme \"{other}\"; only http and https can be downloaded"
            ))
        }
    }

    let extension = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|last| last.rsplit_once('.'))
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();

    if DOWNLOADABLE_EXTENSIONS.contains(&extension.as_str()) {
        Ok(UrlKind::DirectFile)
    } else {
        Ok(UrlKind::WebPage)
    }
}

/// Extensions a plain HTTP GET can download directly.
pub(crate) const DOWNLOADABLE_EXTENSIONS: &[&str] = &[
    // images
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "tif", "tiff", "ico",
    // video
    "mp4", "m4v", "webm", "mov", "avi", "mkv",
    // audio
    "mp3", "wav", "ogg", "m4a", "flac",
    // documents commonly captured as evidence
    "pdf",
];

/// Picks the most likely image URL out of an HTML page.
///
/// Social platforms and article pages rarely expose the image itself, so the
/// preview image advertised in `og:image` / `twitter:image` is preferred over a
/// page `<img>` tag: those are the crop the site intends to represent the page.
pub(crate) fn extract_image_url(html: &str, base: &str) -> Option<String> {
    let lowered = html.to_ascii_lowercase();

    // meta tags: <meta property="og:image" content="..."> in either order.
    const META_KEYS: &[&str] = &[
        "og:image:secure_url",
        "og:image",
        "twitter:image",
        "twitter:image:src",
    ];

    for key in META_KEYS {
        let Some(key_pos) = lowered.find(key) else {
            continue;
        };
        // Limit the search to the tag that mentions the key.
        let tag_start = lowered[..key_pos].rfind('<').unwrap_or(key_pos);
        let tag_end = lowered[key_pos..]
            .find('>')
            .map(|offset| key_pos + offset)
            .unwrap_or(html.len());
        let tag = &html[tag_start..tag_end];

        if let Some(value) = attribute_value(tag, "content") {
            if let Some(resolved) = resolve_url(&value, base) {
                return Some(resolved);
            }
        }
    }

    // Fall back to the first reasonably-formed <img src="...">.
    let mut search_from = 0;
    while let Some(offset) = lowered[search_from..].find("<img") {
        let tag_start = search_from + offset;
        let tag_end = lowered[tag_start..]
            .find('>')
            .map(|o| tag_start + o)
            .unwrap_or(html.len());
        let tag = &html[tag_start..tag_end];
        if let Some(value) = attribute_value(tag, "src") {
            if let Some(resolved) = resolve_url(&value, base) {
                return Some(resolved);
            }
        }
        search_from = tag_end.max(tag_start + 4);
    }

    None
}

/// Reads a quoted (or unquoted) attribute value out of an HTML tag.
fn attribute_value(tag: &str, name: &str) -> Option<String> {
    let lowered = tag.to_ascii_lowercase();
    let mut from = 0;

    while let Some(offset) = lowered[from..].find(name) {
        let start = from + offset;
        // Reject matches inside another attribute name (e.g. "data-src").
        let preceded_by_name_char = lowered[..start]
            .chars()
            .next_back()
            .is_some_and(|c| c.is_alphanumeric() || c == '-');
        let after = &lowered[start + name.len()..];
        let rest = after.trim_start();

        if preceded_by_name_char || !rest.starts_with('=') {
            from = start + name.len();
            continue;
        }

        let value = rest[1..].trim_start();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.split('"').next())
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.split('\'').next()))
            .or_else(|| value.split_whitespace().next())
            .unwrap_or("")
            .trim();

        if value.is_empty() {
            return None;
        }
        return Some(decode_html_entities(value));
    }

    None
}

/// Resolves a possibly-relative URL against the page it came from.
fn resolve_url(value: &str, base: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with("data:") {
        return None;
    }
    if let Ok(absolute) = Url::parse(trimmed) {
        return matches!(absolute.scheme(), "http" | "https").then(|| absolute.to_string());
    }
    Url::parse(base)
        .ok()?
        .join(trimmed)
        .ok()
        .map(|url| url.to_string())
}

/// Decodes the handful of HTML entities that show up in `src`/`content` values.
fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&#38;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

/// Streams a direct file URL to `destination`, enforcing the size cap.
///
/// Streaming keeps a multi-gigabyte video out of memory. The cap is checked
/// both from `Content-Length` (when advertised) and against bytes actually
/// read, so a lying or chunked response cannot bypass it.
fn http_download_to(url: &str, destination: &Path) -> Result<u64, String> {
    let response = ureq::get(url)
        .set("User-Agent", DOWNLOAD_USER_AGENT)
        .set("Accept", "*/*")
        .call();

    let response = match response {
        Ok(response) => response,
        Err(ureq::Error::Status(status, _)) => {
            return Err(format!("HTTP {status} while downloading {url}"))
        }
        Err(ureq::Error::Transport(e)) => {
            return Err(format!("Failed to download {url}: {e}"))
        }
    };

    if let Some(length) = response
        .header("Content-Length")
        .and_then(|v| v.trim().parse::<u64>().ok())
    {
        if length > MAX_ATTACHMENT_BYTES {
            return Err(format!(
                "Downloaded file exceeds the {} limit",
                max_attachment_label()
            ));
        }
    }

    if let Some(file) = destination.parent() {
        std::fs::create_dir_all(file)
            .map_err(|e| format!("Failed to create attachments dir: {e}"))?;
    }

    let mut file = std::fs::File::create(destination)
        .map_err(|e| format!("Failed to create attachment file: {e}"))?;

    let mut reader = response.into_reader();
    let mut buffer = [0u8; 64 * 1024];
    let mut written: u64 = 0;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed while reading the download: {e}"))?;
        if read == 0 {
            break;
        }
        written += read as u64;
        if written > MAX_ATTACHMENT_BYTES {
            // Stop and remove the partial file rather than filling the disk.
            drop(file);
            let _ = std::fs::remove_file(destination);
            return Err(format!(
                "Downloaded file exceeds the {} limit",
                max_attachment_label()
            ));
        }
        file.write_all(&buffer[..read])
            .map_err(|e| format!("Failed to write attachment: {e}"))?;
    }

    file.flush()
        .map_err(|e| format!("Failed to flush attachment: {e}"))?;

    if written == 0 {
        let _ = std::fs::remove_file(destination);
        return Err(format!("Downloaded file from {url} was empty"));
    }

    Ok(written)
}

/// Fetches an HTML page and returns its body, bounded by [`MAX_HTML_BYTES`].
fn fetch_html(url: &str) -> Result<String, String> {
    let response = ureq::get(url)
        .set("User-Agent", DOWNLOAD_USER_AGENT)
        .set("Accept", "text/html,application/xhtml+xml")
        .call();

    let response = match response {
        Ok(response) => response,
        Err(ureq::Error::Status(status, _)) => {
            return Err(format!("HTTP {status} while fetching {url}"))
        }
        Err(ureq::Error::Transport(e)) => {
            return Err(format!("Failed to fetch {url}: {e}"))
        }
    };

    let mut reader = response.into_reader().take(MAX_HTML_BYTES);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read {url}: {e}"))?;

    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Downloads a direct file (or an image advertised by a web page) to disk.
fn download_direct_file(
    temp_dir: &Path,
    url: &str,
    kind: UrlKind,
) -> Result<(PathBuf, u64, String), String> {
    let (file_url, source_page) = match kind {
        UrlKind::DirectFile => (url.to_string(), None),
        UrlKind::WebPage => {
            // A page rather than a file: ask the page which image represents it.
            let html = fetch_html(url)?;
            let image = extract_image_url(&html, url).ok_or_else(|| {
                format!(
                    "No image found on {url}. yt-dlp is used for video pages; \
                     this page exposed no og:image or <img> to download."
                )
            })?;
            (image, Some(url.to_string()))
        }
    };

    let parsed = Url::parse(&file_url).map_err(|e| format!("Invalid image URL: {e}"))?;
    let raw_name = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|name| !name.is_empty())
        .unwrap_or("download");
    let file_name = sanitize_file_name(&raw_name.replace('%', "_"));

    let destination = temp_dir.join(&file_name);
    let written = http_download_to(&file_url, &destination)?;

    let descriptor = match source_page {
        Some(page) => format!("{file_url} (image from {page})"),
        None => file_url,
    };

    Ok((destination, written, descriptor))
}

/// Downloads media from a URL and stores it as an attachment on the source.
///
/// Network is only used when this command is invoked — the operator must
/// explicitly click "Download Media" in the UI. The downloaded file is copied
/// through the normal attachment store, and the temp download is removed.
///
/// Direct links to a file (an image, video, audio, or PDF) are fetched with a
/// plain HTTP GET. Anything else is treated as a web page and handed to yt-dlp,
/// which can extract media from supported video sites.
///
/// A bundled yt-dlp sidecar is preferred; a `PATH` install is used otherwise.
/// ffmpeg must be on `PATH` to merge separate video and audio streams.
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

    // A per-download directory keeps concurrent or repeated downloads from
    // picking up a stale file left by an earlier attempt.
    let temp_dir = std::env::temp_dir().join(format!("osint-download-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {e}"))?;

    let kind = classify_url(&url)?;

    // A direct file (image, video, audio, PDF) is a plain GET. Only a web page
    // needs yt-dlp, and only when it is actually available — so an image page
    // still resolves on a machine without yt-dlp installed.
    let downloaded_path = match kind {
        UrlKind::DirectFile => download_direct_file(&temp_dir, &url, kind)?.0,
        UrlKind::WebPage => {
            let yt_dlp = find_yt_dlp(&app).ok();

            match yt_dlp {
                Some(yt_dlp) => {
                    let output_template = temp_dir.join("%(title)s.%(ext)s");
                    let args = yt_dlp_args(&url, &output_template.to_string_lossy());

                    let output = Command::new(&yt_dlp)
                        .args(&args)
                        .output()
                        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

                    if output.status.success() {
                        // `--print` writes one line per file. Normally that is a
                        // single path, but a site that emits several formats
                        // would produce more than one, so take the last one.
                        let reported =
                            parse_reported_path(&String::from_utf8_lossy(&output.stdout));
                        match reported {
                            Some(path) => path,
                            None => {
                                let _ = std::fs::remove_dir_all(&temp_dir);
                                return Err("yt-dlp did not report a downloaded file".to_string());
                            }
                        }
                    } else {
                        // A page yt-dlp cannot handle may still advertise an
                        // image; try that before surfacing the yt-dlp error.
                        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                        match download_direct_file(&temp_dir, &url, UrlKind::WebPage) {
                            Ok((path, _, _)) => path,
                            Err(image_error) => {
                                let _ = std::fs::remove_dir_all(&temp_dir);
                                return Err(if stderr.is_empty() {
                                    format!("yt-dlp exited with {}; {image_error}", output.status)
                                } else {
                                    format!("yt-dlp failed: {stderr}; {image_error}")
                                });
                            }
                        }
                    }
                }
                None => {
                    // No yt-dlp at all: fall back to the page's advertised image.
                    download_direct_file(&temp_dir, &url, kind)?.0
                }
            }
        }
    };

    if !downloaded_path.exists() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Downloaded file {} was not found on disk",
            downloaded_path.display()
        ));
    }

    let metadata = std::fs::metadata(&downloaded_path)
        .map_err(|e| format!("Failed to read downloaded file metadata: {e}"))?;

    if metadata.len() > MAX_ATTACHMENT_BYTES {
        // Clean up before erroring.
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Downloaded file exceeds the {} limit",
            max_attachment_label()
        ));
    }

    let file_name = downloaded_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download")
        .to_string();

    // Copy on disk rather than reading the whole media file into memory.
    let destination = copy_attachment(&app, &source_id, &file_name, &downloaded_path)?;

    // Clean up the temp download now that it is in the attachment store.
    let _ = std::fs::remove_dir_all(&temp_dir);

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
        destination.relative,
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
    //
    // Stamping performs blocking network I/O, so it runs on a blocking thread
    // rather than stalling the async runtime.
    let attachment_path = match resolve_attachment_path(&app, &attachment.relative_path) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to resolve attachment path for auto-timestamp: {e}");
            return Ok(attachment);
        }
    };

    if attachment_path.exists() {
        let stamp_path = attachment_path.clone();
        let stamped = tauri::async_runtime::spawn_blocking(move || {
            create_timestamp_proof(&stamp_path)
        })
        .await;

        match stamped {
            Ok(Ok(outcome)) => {
                        eprintln!("Auto-timestamp: {}", outcome.summary());
                        if let Err(e) = record_timestamp(
                            &app,
                            &attachment.id,
                            &attachment.relative_path,
                            &outcome.proof,
                        )
                        .await
                        {
                            eprintln!("Failed to record auto-timestamp: {e}");
                        }
                    }
            Ok(Err(e)) => eprintln!("Auto-timestamp proof creation failed: {e}"),
            Err(e) => eprintln!("Auto-timestamp task failed: {e}"),
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

    // Check for an existing timestamp. An existing record only blocks a re-stamp
        // when its proof is a valid OpenTimestamps file; a proof written by an
        // earlier build cannot be verified by anything, so re-stamping it is the
        // only way to make the evidence usable again.
        let existing = get_timestamp_for_attachment(&app, &attachment_id).await?;
        if let Some(record) = &existing {
            let app_config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("Failed to get app config dir: {}", e))?;
            let existing_proof_path = app_config_dir.join(Path::new(&record.ots_path));

            match std::fs::read(&existing_proof_path) {
                Ok(bytes) => {
                    if crate::opentimestamps::summarize_proof(&bytes).is_ok() {
                        return Err("Attachment already has a timestamp".to_string());
                    }
                    eprintln!(
                        "Replacing unreadable timestamp proof for attachment {attachment_id}: \
                         {} is not a valid OpenTimestamps file",
                        record.ots_path
                    );
                }
                Err(e) => {
                    eprintln!(
                        "Replacing missing timestamp proof for attachment {attachment_id}: {e}"
                    );
                }
            }
        }

    // Resolve the attachment's absolute path.
    let attachment_path = crate::opentimestamps::resolve_attachment_path(&app, &relative_path)?;

    if !attachment_path.exists() {
        return Err("Attachment file not found on disk".to_string());
    }

    // Create the timestamp proof (hashes file, submits to calendars). This is
    // blocking network I/O, so it runs off the async runtime.
    let stamp_path = attachment_path.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        create_timestamp_proof(&stamp_path)
    })
    .await
    .map_err(|e| format!("Timestamp task failed: {e}"))??;

    // Record and write the .ots proof.
    record_timestamp(&app, &attachment_id, &relative_path, &outcome.proof).await
}

/// Verifies an existing timestamp proof against the Bitcoin blockchain.
///
/// This upgrades the proof by asking the calendars named in its pending
/// attestations for a blockchain attestation, then checks the attested merkle
/// root against the real block header. Only a proof that passes that check is
/// marked `confirmed`; a proof that is still pending stays `pending`.
#[command]
pub async fn verify_timestamp(
    app: AppHandle,
    attachment_id: String,
) -> Result<TimestampRecord, String> {
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

    let proof = std::fs::read(&ots_absolute)
        .map_err(|e| format!("Failed to read .ots proof: {e}"))?;

    // Upgrading and verifying both perform blocking network I/O.
    let proof_for_task = proof.clone();
    let (upgrade, verification) = tauri::async_runtime::spawn_blocking(move || {
        let upgrade = upgrade_proof(&proof_for_task)?;
        let verification = verify_proof(&upgrade.proof)?;
        Ok::<_, String>((upgrade, verification))
    })
    .await
    .map_err(|e| format!("Verification task failed: {e}"))??;

    // Persist an upgraded proof so the blockchain attestation is not lost.
    if upgrade.changed {
        std::fs::write(&ots_absolute, &upgrade.proof)
            .map_err(|e| format!("Failed to write upgraded .ots proof: {e}"))?;
    }

    record.verification_notes = verification.notes.clone();

        if upgrade.changed {
            record.verification_notes.push(format!(
                "Upgraded with attestations from: {}",
                upgrade.upgraded_by.join(", ")
            ));
        }
        if !upgrade.complete {
            record
                .verification_notes
                .push("No blockchain attestation yet; the calendar has not published one".to_string());
        }
        for failure in &upgrade.failures {
            record
                .verification_notes
                .push(format!("Calendar issue: {failure}"));
        }

        record.block_height = verification.block_height;
    record.block_time = verification.block_time.clone();

    if verification.verified {
        record.status = TimestampStatus::Confirmed;
        record.confirmed_at = Some(chrono::Utc::now().to_rfc3339());
        confirm_timestamp(&app, &record.id).await?;
        } else {
            // Either the calendar's aggregation transaction has not been mined yet
            // (normal for hours after stamping) or a blockchain attestation could
            // not be checked. Both leave the timestamp pending rather than
            // claiming a confirmation that was never proven.
            record.status = TimestampStatus::Pending;
        }

        Ok(record)
    }

    /// Gets the timestamp record for an attachment, if any.
    ///
    /// The stored status is reconciled against the proof on disk, so a proof that
    /// gained a blockchain attestation (for example because an operator verified it
    /// on another machine) is reported correctly without a re-check.
    #[command]
    pub async fn get_timestamp_status(
        app: AppHandle,
        attachment_id: String,
    ) -> Result<Option<TimestampRecord>, String> {
        let record = get_timestamp_for_attachment(&app, &attachment_id).await?;
        let Some(mut record) = record else {
            return Ok(None);
        };

        let app_config_dir = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("Failed to get app config dir: {}", e))?;
        let ots_absolute = app_config_dir.join(Path::new(&record.ots_path));

        let Ok(proof) = std::fs::read(&ots_absolute) else {
            // The database says a proof exists but the file is gone. Report that
            // honestly instead of showing a status the proof cannot back up.
            record.status = TimestampStatus::Failed;
            record
                .verification_notes
                .push("Proof file is missing from disk".to_string());
            return Ok(Some(record));
        };

        match crate::opentimestamps::summarize_proof(&proof) {
            Ok(summary) => {
                record.block_height = summary.block_height;
                record.verification_notes = vec![if summary.complete {
                    format!(
                        "Proof contains a blockchain attestation{}",
                        summary
                            .block_height
                            .map(|h| format!(" at block {h}"))
                            .unwrap_or_default()
                    )
                } else {
                    format!(
                        "Held by {} calendar(s); not yet confirmed",
                        summary.calendars.len()
                    )
                }];

                // A complete proof means the timestamp is anchored, even if this
                // app has not run the block-header check yet.
                if summary.complete {
                    record.status = TimestampStatus::Confirmed;
                    if record.confirmed_at.is_none() {
                        record.confirmed_at = Some(chrono::Utc::now().to_rfc3339());
                        confirm_timestamp(&app, &record.id).await?;
                    }
                }
            }
            Err(e) => {
                record.status = TimestampStatus::Failed;
                record
                    .verification_notes
                    .push(format!("Proof file is unreadable: {e}"));
            }
        }

        Ok(Some(record))
    }