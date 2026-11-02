//! Verifies the asset-protocol scope pattern actually matches the paths the
//! attachment commands produce. If this drifts, media previews silently fail
//! with a blank frame, so it is worth pinning down.
//!
//! Traversal is handled in two layers:
//!   1. `tauri::path::SafePathBuf` rejects any path containing `..` before the
//!      scope is consulted (see `protocol/asset.rs`).
//!   2. The glob scope below confines reads to the attachment tree.
//!
//! The glob alone does not reject `..`, so both layers are asserted here.

#[cfg(test)]
mod tests {
    use glob::{MatchOptions, Pattern};
    use std::path::{Component, Path, PathBuf};

    /// Mirrors `app.security.assetProtocol.scope` in tauri.conf.json.
    const SCOPE: &str = r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\attachments\**";

    fn in_scope(path: &str) -> bool {
        Pattern::new(SCOPE).unwrap().matches_path_with(
            Path::new(path),
            MatchOptions {
                case_sensitive: false,
                require_literal_separator: false,
                require_literal_leading_dot: false,
            },
        )
    }

    /// Mirrors `tauri::path::SafePathBuf::new`.
    fn traversal_safe(path: &str) -> bool {
        !PathBuf::from(path)
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    }

    #[test]
    fn matches_files_inside_attachment_tree() {
        assert!(in_scope(
            r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\attachments\abc-123\photo.png"
        ));
        assert!(in_scope(
            r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\attachments\abc-123\clip.mp4"
        ));
    }

    #[test]
    fn rejects_paths_outside_attachment_tree() {
        assert!(!in_scope(
            r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\osint_case_manager.db"
        ));
        assert!(!in_scope(r"C:\Windows\System32\drivers\etc\hosts"));
    }

    #[test]
    fn rejects_directory_traversal() {
        assert!(!traversal_safe(
            r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\attachments\..\..\secret.txt"
        ));
        assert!(!traversal_safe("../secret.txt"));
        assert!(traversal_safe(
            r"C:\Users\tester\AppData\Roaming\com.osint.casemanager\attachments\abc-123\photo.png"
        ));
    }
}