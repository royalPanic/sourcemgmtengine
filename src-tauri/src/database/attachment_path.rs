//! Resolves stored attachment paths against the app config directory.
//!
//! Both the attachment commands and the OpenTimestamps subsystem need to turn a
//! stored `relative_path` into an absolute path, and both must refuse anything
//! that escapes the attachment store. Keeping one implementation means the
//! containment check cannot drift between them.

use std::path::{Component, Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Resolves a stored relative path against the app config directory.
///
/// The SQL plugin keeps its database in `app_config_dir`, so attachments live
/// alongside it and the asset-protocol scope (`$APPCONFIG/attachments/**`)
/// covers exactly this tree.
///
/// Three things are rejected:
///
/// * an absolute path, which would ignore the store entirely;
/// * `..` and the Windows prefix component, which would walk out of it;
/// * a path whose canonical parent is not inside the canonical config dir.
///
/// That last check is what catches a symlink planted inside the store. It is
/// mandatory rather than best-effort: if either side cannot be canonicalised
/// the path is refused, because a check that silently does not run is worse
/// than no check at all.
pub fn resolve_attachment_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
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

    let canonical_parent = parent.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve attachment path {}: {}",
            parent.display(),
            e
        )
    })?;
    let canonical_root = app_config_dir.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve app config dir {}: {}",
            app_config_dir.display(),
            e
        )
    })?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Attachment path escapes the app config directory".to_string());
    }

    Ok(resolved)
}
