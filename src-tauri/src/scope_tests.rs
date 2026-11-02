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
//!
//! Everything is built with `PathBuf` rather than hardcoded strings: `glob`
//! splits patterns on `std::path::is_separator`, which is only `/` on Unix, so
//! a literal `C:\...\attachments\**` is a single component there and fails to
//! parse. Building paths natively keeps the test meaningful on every platform.

#[cfg(test)]
mod tests {
    use glob::{MatchOptions, Pattern};
    use std::path::{Component, Path, PathBuf};

    /// A stand-in for the platform's app config directory.
    fn app_config_dir() -> PathBuf {
        let mut root = PathBuf::from(std::path::MAIN_SEPARATOR.to_string());
        root.push("home");
        root.push("tester");
        root.push("com.osint.casemanager");
        root
    }

    /// Mirrors `app.security.assetProtocol.scope` in tauri.conf.json, which is
    /// written as `$APPCONFIG/attachments/**` and substituted by Tauri.
    fn scope_pattern() -> String {
        let mut scope = app_config_dir();
        scope.push("attachments");
        format!("{}{}**", scope.display(), std::path::MAIN_SEPARATOR)
    }

    fn in_scope(path: &Path) -> bool {
        Pattern::new(&scope_pattern()).unwrap().matches_path_with(
            path,
            MatchOptions {
                case_sensitive: false,
                require_literal_separator: false,
                require_literal_leading_dot: false,
            },
        )
    }

    /// Mirrors `tauri::path::SafePathBuf::new`.
    fn traversal_safe(path: &Path) -> bool {
        !path
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    }

    /// Builds a path the way `resolve_attachment_path` does: by pushing
    /// components onto the app config directory.
    fn attachment_path(parts: &[&str]) -> PathBuf {
        let mut path = app_config_dir();
        path.push("attachments");
        for part in parts {
            path.push(part);
        }
        path
    }

    #[test]
    fn scope_pattern_parses() {
        // A malformed pattern would panic inside `in_scope`, so assert it here
        // with a clear message instead.
        Pattern::new(&scope_pattern()).expect("asset protocol scope must be a valid glob");
    }

    #[test]
    fn matches_files_inside_attachment_tree() {
        assert!(in_scope(&attachment_path(&["abc-123", "photo.png"])));
        assert!(in_scope(&attachment_path(&["abc-123", "clip.mp4"])));
        assert!(in_scope(&attachment_path(&["abc-123", "nested", "deep.png"])));
    }

    #[test]
    fn rejects_paths_outside_attachment_tree() {
        let mut database = app_config_dir();
        database.push("osint_case_manager.db");
        assert!(!in_scope(&database));

        let mut elsewhere = PathBuf::from(std::path::MAIN_SEPARATOR.to_string());
        elsewhere.push("etc");
        elsewhere.push("hosts");
        assert!(!in_scope(&elsewhere));
    }

    #[test]
    fn rejects_directory_traversal() {
        let escaping = attachment_path(&["..", "..", "secret.txt"]);
        assert!(!traversal_safe(&escaping));

        assert!(!traversal_safe(Path::new("../secret.txt")));
        assert!(traversal_safe(&attachment_path(&["abc-123", "photo.png"])));
    }

    #[test]
    fn configured_scope_is_valid_on_this_platform() {
        // Guards against someone writing a Windows-only scope into the config.
        let raw = include_str!("../tauri.conf.json");
        let config: serde_json::Value =
            serde_json::from_str(raw).expect("tauri.conf.json must be valid JSON");

        let scopes = config["app"]["security"]["assetProtocol"]["scope"]
            .as_array()
            .expect("assetProtocol.scope must be an array");

        let root = app_config_dir();
        for scope in scopes {
            let scope = scope.as_str().expect("scope entries must be strings");
            let resolved = scope.replace("$APPCONFIG", &root.display().to_string());
            Pattern::new(&resolved)
                .unwrap_or_else(|e| panic!("scope {scope:?} is not a valid glob here: {e}"));
        }
    }
}
