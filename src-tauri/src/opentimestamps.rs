//! OpenTimestamps chronological proof client.
//!
//! Implements the OpenTimestamps calendar client directly in Rust (no Python
//! `ots` CLI required). Files are hashed with SHA-256, the hash is submitted
//! to public OpenTimestamps calendar servers, and the resulting attestations
//! are bundled into a `.ots` proof file stored alongside the attachment.
//!
//! Timestamps start as `pending` and become `confirmed` once the Bitcoin
//! blockchain confirms the calendar's aggregation transaction (typically
//! hours). Verification can be performed later by checking the .ots proof
//! against the calendar/blockchain.

use crate::database::pool;
use crate::models::models::{TimestampRecord, TimestampStatus};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use ureq;

/// Public OpenTimestamps calendar servers (free, no registration required).
pub const CALENDARS: &[&str] = &[
    "https://alice.btc.calendar.opentimestamps.org",
    "https://bob.btc.calendar.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
];

/// OpenTimestamps operation tags.
const OP_APPEND: u8 = 0x00;
const OP_SHA256: u8 = 0x01;
const OP_VERIFY: u8 = 0x02;

/// OTS format version byte.
const OTS_VERSION: u8 = 0x00;

/// Computes the SHA-256 hash of a file and returns the hex digest.
pub fn compute_sha256(file_path: &Path) -> Result<String, String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file for hashing: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();

    Ok(format!("{result:x}"))
}

/// Builds a minimal OpenTimestamps `.ots` proof from a file hash and a list of
/// calendar attestations.
///
/// Structure:
///   version(0x00)
///   APPEND(file_hash)  SHA256
///   for each calendar:
///     APPEND(calendar_id_hash)  SHA256  VERIFY(attestation)
pub fn build_ots_proof(
    file_hash: &str,
    attestations: &[(String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    let mut ops: Vec<u8> = Vec::new();

    // Version byte.
    ops.push(OTS_VERSION);

    // Decode the file hash from hex.
    let hash_bytes = hex::decode(file_hash).map_err(|e| format!("Invalid file hash hex: {e}"))?;
    if hash_bytes.len() != 32 {
        return Err("File hash must be 32 bytes".to_string());
    }

    // APPEND(file_hash) then SHA256.
    ops.push(OP_APPEND);
    ops.extend_from_slice(&hash_bytes);
    ops.push(OP_SHA256);

    // For each calendar attestation: APPEND(calendar_id) SHA256 VERIFY(attestation).
    for (calendar_id, attestation) in attestations {
        let cal_hash = Sha256::digest(calendar_id.as_bytes());
        ops.push(OP_APPEND);
        ops.extend_from_slice(&cal_hash);
        ops.push(OP_SHA256);

        ops.push(OP_VERIFY);
        // Attestation length as 2-byte big-endian, then the attestation bytes.
        let att_len = attestation.len() as u16;
        ops.push((att_len >> 8) as u8);
        ops.push((att_len & 0xFF) as u8);
        ops.extend_from_slice(attestation);
    }

    Ok(ops)
}

/// Submits a file hash to an OpenTimestamps calendar and returns the attestation.
pub fn submit_to_calendar(calendar_url: &str, file_hash_hex: &str) -> Result<Vec<u8>, String> {
    let body = format!("hash={file_hash_hex}");

    let response = ureq::post(calendar_url)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&body)
        .map_err(|e| format!("Calendar {calendar_url} request failed: {e}"))?;

    let status = response.status();
    if status < 200 || status >= 300 {
        return Err(format!(
            "Calendar {calendar_url} returned HTTP {status}"
        ));
    }

    let attestation = response
        .into_string()
        .map_err(|e| format!("Failed to read calendar response: {e}"))?
        .into_bytes();

    if attestation.is_empty() {
        return Err(format!("Calendar {calendar_url} returned empty attestation"));
    }

    Ok(attestation)
}

/// Creates an OpenTimestamps timestamp proof for a file.
///
/// Hashes the file, submits the hash to all configured calendars, builds the
/// `.ots` proof, and returns the proof bytes. Calendars that fail are skipped
/// (at least one success is required).
pub fn create_timestamp_proof(file_path: &Path) -> Result<Vec<u8>, String> {
    let file_hash = compute_sha256(file_path)?;

    let mut attestations: Vec<(String, Vec<u8>)> = Vec::new();
    let mut errors = Vec::new();

    for calendar in CALENDARS {
        match submit_to_calendar(calendar, &file_hash) {
            Ok(attestation) => {
                attestations.push((calendar.to_string(), attestation));
            }
            Err(e) => {
                errors.push(format!("{calendar}: {e}"));
            }
        }
    }

    if attestations.is_empty() {
        return Err(format!(
            "All calendar submissions failed: {}",
            errors.join("; ")
        ));
    }

    build_ots_proof(&file_hash, &attestations)
}

/// Resolves the `.ots` proof path for an attachment: same folder, `.ots`
/// extension replacing the original extension.
fn ots_path_for_attachment(relative_path: &str) -> String {
    let path = Path::new(relative_path);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment");
    let parent = path.parent().and_then(|p| p.to_str()).unwrap_or("");
    if parent.is_empty() {
        format!("{stem}.ots")
    } else {
        format!("{parent}/{stem}.ots")
    }
}

/// Writes the `.ots` proof bytes alongside the attachment and records the
/// timestamp in the database.
pub async fn record_timestamp(
    app: &AppHandle,
    attachment_id: &str,
    relative_path: &str,
    proof: &[u8],
) -> Result<TimestampRecord, String> {
    let pool = pool::pool(app).await?;

    let attachment_path = resolve_attachment_path(app, relative_path)?;
    let ots_path_str = ots_path_for_attachment(relative_path);

    let ots_absolute = attachment_path
        .parent()
        .ok_or_else(|| "Attachment path has no parent".to_string())?
        .join(Path::new(&ots_path_str).file_name().unwrap_or_default());

    std::fs::write(&ots_absolute, proof)
        .map_err(|e| format!("Failed to write .ots proof: {e}"))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO source_timestamp (id, source_attachment_id, ots_path, status, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(attachment_id)
    .bind(&ots_path_str)
    .bind(TimestampStatus::Pending.as_db())
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to record timestamp: {e}"))?;

    Ok(TimestampRecord {
        id,
        source_attachment_id: attachment_id.to_string(),
        ots_path: ots_path_str,
        status: TimestampStatus::Pending,
        created_at: now,
        confirmed_at: None,
    })
}

/// Resolves a stored relative attachment path against the app config directory.
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
            std::path::Component::Normal(part) => resolved.push(part),
            std::path::Component::CurDir => {}
            _ => return Err("Attachment path contains invalid components".to_string()),
        }
    }

    Ok(resolved)
}

/// Gets the timestamp record for an attachment, if any.
pub async fn get_timestamp_for_attachment(
    app: &AppHandle,
    attachment_id: &str,
) -> Result<Option<TimestampRecord>, String> {
    let pool = pool::pool(app).await?;

    let row = sqlx::query(
        "SELECT id, source_attachment_id, ots_path, status, created_at, confirmed_at FROM source_timestamp WHERE source_attachment_id = ?",
    )
    .bind(attachment_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get timestamp: {e}"))?;

    Ok(row.map(|row| TimestampRecord {
        id: row.get("id"),
        source_attachment_id: row.get("source_attachment_id"),
        ots_path: row.get("ots_path"),
        status: TimestampStatus::from_db(&row.get::<String, _>("status")),
        created_at: row.get("created_at"),
        confirmed_at: row.get::<Option<String>, _>("confirmed_at"),
    }))
}

/// Marks a timestamp as confirmed in the database.
pub async fn confirm_timestamp(
    app: &AppHandle,
    timestamp_id: &str,
) -> Result<(), String> {
    let pool = pool::pool(app).await?;
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE source_timestamp SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(timestamp_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to confirm timestamp: {e}"))?;

    Ok(())
}

/// Marks a timestamp as failed in the database.
pub async fn fail_timestamp(app: &AppHandle, timestamp_id: &str) -> Result<(), String> {
    let pool = pool::pool(app).await?;

    sqlx::query("UPDATE source_timestamp SET status = 'failed' WHERE id = ?")
        .bind(timestamp_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to mark timestamp as failed: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ots_path_for_attachment_replaces_extension() {
        assert_eq!(
            ots_path_for_attachment("attachments/abc-123/photo.png"),
            "attachments/abc-123/photo.ots"
        );
        assert_eq!(
            ots_path_for_attachment("attachments/abc-123/clip.mp4"),
            "attachments/abc-123/clip.ots"
        );
        assert_eq!(
            ots_path_for_attachment("attachments/abc-123/file"),
            "attachments/abc-123/file.ots"
        );
    }

    #[test]
    fn build_ots_proof_has_version_byte() {
        let proof = build_ots_proof(
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            &[],
        )
        .unwrap();
        assert_eq!(proof[0], OTS_VERSION);
    }

    #[test]
    fn build_ots_proof_contains_append_and_sha256() {
        let proof = build_ots_proof(
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            &[],
        )
        .unwrap();
        assert!(proof.contains(&OP_APPEND));
        assert!(proof.contains(&OP_SHA256));
    }

    #[test]
    fn compute_sha256_returns_hex() {
        use std::io::Write;
        let dir = std::env::temp_dir();
        let file_path = dir.join(format!("ots-test-{}.txt", uuid::Uuid::new_v4()));
        std::fs::File::create(&file_path)
            .unwrap()
            .write_all(b"hello world")
            .unwrap();

        let hash = compute_sha256(&file_path).unwrap();
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));

        let _ = std::fs::remove_file(&file_path);
    }
}