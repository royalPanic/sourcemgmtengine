//! Shared helpers for optional, user-editable fields.
//!
//! Dates and times are stored as plain text (`YYYY-MM-DD` / `HH:MM`) so they
//! stay human-readable and timezone-free. Both containers and sources use the
//! same shapes, so the checks live here rather than in each command module.

/// Interprets a patch value for an optional column.
///
/// Tauri's command deserializer maps both a missing key and an explicit `null`
/// to `None`, so the two cannot be told apart. Instead the frontend sends an
/// empty string to clear a field:
///
/// * `None`      — field omitted, leave the stored value alone
/// * `Some("")`  — clear the field (bind NULL)
/// * `Some(v)`   — set the field to `v`
pub fn patch_optional(value: Option<String>) -> Option<Option<String>> {
    value.map(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Interprets a patch value for an optional integer column.
///
/// Same contract as [`patch_optional`], but for numbers. The frontend sends `0`
/// to clear a rating, because Tauri maps both a missing key and an explicit
/// `null` to `None` and the two cannot be told apart.
///
/// * `None`     — field omitted, leave the stored value alone
/// * `Some(0)`  — clear the field (bind NULL)
/// * `Some(v)`  — set the field to `v`
pub fn patch_optional_int(value: Option<i32>) -> Option<Option<i32>> {
    value.map(|v| if v == 0 { None } else { Some(v) })
}

/// Admiralty source reliability codes, best to worst.
pub const RELIABILITY_CODES: [&str; 6] = ["A", "B", "C", "D", "E", "F"];

/// True when `value` is a valid Admiralty reliability code.
pub fn is_reliability_code(value: &str) -> bool {
    RELIABILITY_CODES.contains(&value)
}

/// True when `value` is a valid Admiralty information credibility code.
pub fn is_credibility_code(value: i32) -> bool {
    (1..=6).contains(&value)
}

/// Validates a reliability patch, rejecting anything the database CHECK
/// constraint would refuse. An empty string is a clear, not an error.
pub fn validate_reliability_patch(value: &Option<String>) -> Result<(), String> {
    match value.as_deref() {
        None | Some("") => Ok(()),
        Some(code) if is_reliability_code(code) => Ok(()),
        Some(code) => Err(format!(
            "Reliability must be one of A-F, got \"{}\"",
            code
        )),
    }
}

/// Validates a credibility patch. `0` is a clear, not an error.
pub fn validate_credibility_patch(value: Option<i32>) -> Result<(), String> {
    match value {
        None | Some(0) => Ok(()),
        Some(code) if is_credibility_code(code) => Ok(()),
        Some(code) => Err(format!("Credibility must be 1-6, got {}", code)),
    }
}

pub fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits_ok = value
        .char_indices()
        .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !digits_ok {
        return false;
    }
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

pub fn is_hh_mm(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    let digits_ok = value
        .char_indices()
        .all(|(i, c)| i == 2 || c.is_ascii_digit());
    if !digits_ok {
        return false;
    }
    let hour: u32 = value[0..2].parse().unwrap_or(99);
    let minute: u32 = value[3..5].parse().unwrap_or(99);
    hour < 24 && minute < 60
}
