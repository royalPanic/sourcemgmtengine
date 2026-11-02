//! Verifies that Admiralty ratings can be left unset, set, and cleared.
//!
//! Ratings are optional: a source can be captured before it has been assessed.
//! The create path always allowed that, but the update path used to send an
//! empty string and `0`, which the database CHECK constraints reject. These
//! tests pin the patch contract that fixes it.

#[cfg(test)]
mod tests {
    use crate::validation::{
        is_credibility_code, is_reliability_code, patch_optional, patch_optional_int,
        validate_credibility_patch, validate_reliability_patch,
    };

    #[test]
    fn omitted_rating_leaves_value_alone() {
        assert_eq!(patch_optional(None), None);
        assert_eq!(patch_optional_int(None), None);
    }

    #[test]
    fn empty_rating_clears_value() {
        assert_eq!(patch_optional(Some(String::new())), Some(None));
        assert_eq!(patch_optional(Some("   ".to_string())), Some(None));
        assert_eq!(patch_optional_int(Some(0)), Some(None));
    }

    #[test]
    fn supplied_rating_sets_value() {
        assert_eq!(
            patch_optional(Some("A".to_string())),
            Some(Some("A".to_string()))
        );
        assert_eq!(
            patch_optional(Some("  F  ".to_string())),
            Some(Some("F".to_string()))
        );
        assert_eq!(patch_optional_int(Some(1)), Some(Some(1)));
        assert_eq!(patch_optional_int(Some(6)), Some(Some(6)));
    }

    #[test]
    fn every_admiralty_code_is_accepted() {
        for code in ["A", "B", "C", "D", "E", "F"] {
            assert!(is_reliability_code(code), "{code} should be valid");
            assert!(validate_reliability_patch(&Some(code.to_string())).is_ok());
        }
        for code in 1..=6 {
            assert!(is_credibility_code(code), "{code} should be valid");
            assert!(validate_credibility_patch(Some(code)).is_ok());
        }
    }

    #[test]
    fn out_of_range_ratings_are_rejected() {
        // These would otherwise reach the database and trip a CHECK constraint,
        // surfacing as an opaque "Failed to update source" error.
        for code in ["G", "a", "AB", "1", " "] {
            if code.trim().is_empty() {
                continue;
            }
            assert!(
                validate_reliability_patch(&Some(code.to_string())).is_err(),
                "{code:?} should be rejected"
            );
        }
        for code in [7, -1, 100] {
            assert!(
                validate_credibility_patch(Some(code)).is_err(),
                "{code} should be rejected"
            );
        }
    }

    #[test]
    fn clearing_is_not_an_error() {
        assert!(validate_reliability_patch(&Some(String::new())).is_ok());
        assert!(validate_reliability_patch(&None).is_ok());
        assert!(validate_credibility_patch(Some(0)).is_ok());
        assert!(validate_credibility_patch(None).is_ok());
    }

    #[test]
    fn unrated_source_round_trips_as_null() {
        // The end-to-end shape: create unrated, then save an edit without
        // touching the ratings. Both must resolve to NULL, not "" or 0.
        let created_reliability = patch_optional(Some(String::new()));
        let created_credibility = patch_optional_int(Some(0));
        assert_eq!(created_reliability, Some(None));
        assert_eq!(created_credibility, Some(None));

        // A later edit that omits the fields must not resurrect a value.
        assert_eq!(patch_optional(None), None);
        assert_eq!(patch_optional_int(None), None);
    }
}
