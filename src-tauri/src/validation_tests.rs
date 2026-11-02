//! Verifies the shared date/time helpers used by containers and sources.
//!
//! Both store plain text (`YYYY-MM-DD` / `HH:MM`) so the shapes are validated
//! here rather than in the database.

#[cfg(test)]
mod tests {
    use crate::validation::{is_hh_mm, is_iso_date, patch_optional};

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

    #[test]
    fn accepts_iso_dates() {
        assert!(is_iso_date("2026-05-01"));
        assert!(is_iso_date("1999-12-31"));
    }

    #[test]
    fn rejects_malformed_dates() {
        assert!(!is_iso_date(""));
        assert!(!is_iso_date("2026-5-1"));
        assert!(!is_iso_date("2026/05/01"));
        assert!(!is_iso_date("2026-13-01"));
        assert!(!is_iso_date("2026-00-10"));
        assert!(!is_iso_date("2026-05-32"));
        assert!(!is_iso_date("2026-05-01T00:00"));
    }

    #[test]
    fn accepts_hh_mm_times() {
        assert!(is_hh_mm("00:00"));
        assert!(is_hh_mm("23:59"));
    }

    #[test]
    fn rejects_malformed_times() {
        assert!(!is_hh_mm(""));
        assert!(!is_hh_mm("9:30"));
        assert!(!is_hh_mm("24:00"));
        assert!(!is_hh_mm("12:60"));
        assert!(!is_hh_mm("12-30"));
        assert!(!is_hh_mm("12:30:00"));
    }
}
