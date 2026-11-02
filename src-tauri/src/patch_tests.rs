//! Verifies the patch semantics used by `update_case`.
//!
//! Tauri's command deserializer maps both a missing key and an explicit `null`
//! to `None`, so the frontend uses an empty string to mean "clear". These tests
//! pin that contract down.

#[cfg(test)]
mod tests {
    /// Mirrors `patch_optional` in `commands/cases.rs`.
    fn patch_optional(value: Option<String>) -> Option<Option<String>> {
        value.map(|v| {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
    }

    #[test]
    fn omitted_field_leaves_value_alone() {
        assert_eq!(patch_optional(None), None);
    }

    #[test]
    fn empty_string_clears_field() {
        assert_eq!(patch_optional(Some(String::new())), Some(None));
        assert_eq!(patch_optional(Some("   ".to_string())), Some(None));
    }

    #[test]
    fn value_sets_field() {
        assert_eq!(
            patch_optional(Some("2026-05-01".to_string())),
            Some(Some("2026-05-01".to_string()))
        );
        assert_eq!(
            patch_optional(Some("  2026-05-01  ".to_string())),
            Some(Some("2026-05-01".to_string()))
        );
    }
}