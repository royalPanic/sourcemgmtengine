//! OpenTimestamps chronological proof client.
//!
//! Implements the OpenTimestamps calendar client and proof format directly in
//! Rust, so no Python `ots` CLI is required. Files are hashed with SHA-256, the
//! digest is submitted to public OpenTimestamps calendars, and the returned
//! subtrees are merged into a standard `.ots` proof stored alongside the
//! attachment.
//!
//! A timestamp starts `pending`: the calendar holds the commitment but the
//! aggregation transaction has not confirmed yet. Once the calendar can supply
//! a `BitcoinBlockHeaderAttestation`, the proof is upgraded, the attested merkle
//! root is checked against the real block header, and the timestamp becomes
//! `confirmed`.
//!
//! The wire format and proof container are consensus-critical and follow
//! `python-opentimestamps` exactly; see [`serialize`], [`op`], [`attestation`],
//! and [`timestamp`].

pub mod attestation;
pub mod bitcoin;
pub mod calendar;
pub mod op;
pub mod serialize;
pub mod timestamp;

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use sqlx::Row;
use tauri::{AppHandle, Manager};

use crate::database::pool;
use crate::models::models::{TimestampRecord, TimestampStatus};

use attestation::Attestation;
use op::Op;
use timestamp::{DetachedTimestampFile, Timestamp};

pub use calendar::CALENDARS;

/// Computes the SHA-256 digest of a file as raw bytes.
pub fn compute_sha256_bytes(file_path: &Path) -> Result<Vec<u8>, String> {
    let data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file for hashing: {e}"))?;

    Ok(Sha256::digest(&data).to_vec())
}

/// What a stored proof currently says, derived by parsing the `.ots` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProofSummary {
    /// True when the proof contains a blockchain attestation.
    pub complete: bool,
    /// Calendars named in the proof's pending attestations.
    pub calendars: Vec<String>,
    /// Earliest block height attested anywhere in the proof.
    pub block_height: Option<u64>,
}

    impl StampOutcome {
        /// A one-line summary of which calendars accepted the commitment.
        pub fn summary(&self) -> String {
            let mut parts = vec![format!("stamped by {}", self.accepted.join(", "))];
            if !self.failures.is_empty() {
                parts.push(format!("failed: {}", self.failures.join("; ")));
            }
            parts.join(" | ")
        }
    }

/// Summarises a proof without touching the network.
///
/// This is what lets the UI show the real state of an existing timestamp when a
/// source is reopened, instead of assuming nothing has been stamped.
pub fn summarize_proof(proof: &[u8]) -> Result<ProofSummary, String> {
    let detached = DetachedTimestampFile::deserialize(proof)?;

    let mut calendars: Vec<String> = detached
        .timestamp()
        .all_attestations()
        .iter()
        .filter_map(|(_, attestation)| attestation.pending_uri())
        .map(|uri| uri.to_string())
        .collect();
    calendars.sort();
    calendars.dedup();

    Ok(ProofSummary {
        complete: detached.timestamp().is_complete(),
        calendars,
        block_height: detached.timestamp().earliest_block_height(),
    })
}

/// Outcome of submitting a digest to the calendars.
pub struct StampOutcome {
    /// The proof, ready to be written as a `.ots` file.
    pub proof: Vec<u8>,
    /// Calendars that accepted the commitment.
    pub accepted: Vec<String>,
    /// Calendars that failed, with the reason.
    pub failures: Vec<String>,
}

/// Creates an OpenTimestamps proof for a file.
///
/// Hashes the file, submits the digest to every configured calendar, and merges
/// each response into a single proof. Calendars that fail are skipped; at least
/// one success is required.
pub fn create_timestamp_proof(file_path: &Path) -> Result<StampOutcome, String> {
    let digest = compute_sha256_bytes(file_path)?;
    stamp_digest(&digest)
}

/// Submits an already-computed digest to the calendars and builds a proof.
pub fn stamp_digest(digest: &[u8]) -> Result<StampOutcome, String> {
    if digest.len() != 32 {
        return Err(format!(
            "digest must be 32 bytes for SHA-256, got {}",
            digest.len()
        ));
    }

    let mut detached = DetachedTimestampFile::new(Op::Sha256, digest.to_vec())?;

    let mut accepted = Vec::new();
    let mut failures = Vec::new();

    for calendar_url in CALENDARS {
        match calendar::submit_digest(calendar_url, digest) {
            Ok(subtree) => match detached.timestamp_mut().merge(&subtree) {
                Ok(()) => accepted.push((*calendar_url).to_string()),
                Err(e) => failures.push(format!("{calendar_url}: {e}")),
            },
            Err(e) => failures.push(format!("{calendar_url}: {e}")),
        }
    }

    if accepted.is_empty() {
        return Err(format!(
            "All calendar submissions failed: {}",
            failures.join("; ")
        ));
    }

    Ok(StampOutcome {
        proof: detached.serialize()?,
        accepted,
        failures,
    })
}

/// Result of trying to upgrade a proof to a blockchain attestation.
pub struct UpgradeOutcome {
    /// The (possibly upgraded) proof bytes.
    pub proof: Vec<u8>,
    /// True when the proof changed.
    pub changed: bool,
    /// True when the proof now contains a blockchain attestation.
    pub complete: bool,
    /// Calendars that supplied new attestations.
    pub upgraded_by: Vec<String>,
    /// Calendars that failed, with the reason.
    pub failures: Vec<String>,
}

/// Attempts to upgrade a pending proof into a blockchain-attested one.
///
/// Every node carrying a `PendingAttestation` is queried at the calendar named
/// in that attestation. Any subtree returned is merged into the proof, which is
/// how a pending commitment becomes a `BitcoinBlockHeaderAttestation`.
pub fn upgrade_proof(proof: &[u8]) -> Result<UpgradeOutcome, String> {
    let mut detached = DetachedTimestampFile::deserialize(proof)?;

    if detached.timestamp().is_complete() {
        return Ok(UpgradeOutcome {
            proof: proof.to_vec(),
            changed: false,
            complete: true,
            upgraded_by: Vec::new(),
            failures: Vec::new(),
        });
    }

    let mut upgraded_by: Vec<String> = Vec::new();
    let mut failures: Vec<String> = Vec::new();
    let mut changed = false;

    // Collect the work first: merging mutates the tree, so the tree cannot be
    // borrowed while it is being updated.
    let requests: Vec<(String, Vec<u8>)> = detached
        .timestamp()
        .attested_nodes()
        .iter()
        .flat_map(|node| {
            let msg = node.msg().to_vec();
            node.attestations()
                .iter()
                .filter_map(|attestation| {
                    attestation
                        .pending_uri()
                        .map(|uri| (uri.to_string(), msg.clone()))
                })
                .collect::<Vec<_>>()
        })
        .collect();

    for (calendar_url, commitment) in requests {
        match calendar::get_timestamp(&calendar_url, &commitment) {
            Ok(subtree) => {
                // The subtree is rooted at the commitment, so it is merged into
                // the node that carries the commitment.
                match merge_at(&mut detached, &commitment, &subtree) {
                    Ok(true) => {
                        changed = true;
                        upgraded_by.push(calendar_url);
                    }
                    Ok(false) => {}
                    Err(e) => failures.push(format!("{calendar_url}: {e}")),
                }
            }
            Err(calendar::CalendarError::CommitmentNotFound(msg)) => {
                failures.push(format!("{calendar_url}: {msg}"));
            }
            Err(e) => failures.push(format!("{calendar_url}: {e}")),
        }
    }

    let complete = detached.timestamp().is_complete();

    Ok(UpgradeOutcome {
        proof: if changed {
            detached.serialize()?
        } else {
            proof.to_vec()
        },
        changed,
        complete,
        upgraded_by,
        failures,
    })
}

/// Merges `subtree` into the node whose message equals `commitment`.
///
/// Returns whether anything changed.
fn merge_at(
    detached: &mut DetachedTimestampFile,
    commitment: &[u8],
    subtree: &Timestamp,
) -> Result<bool, String> {
    let before = detached.timestamp().clone();

    merge_into_node(detached.timestamp_mut(), commitment, subtree)
        .ok_or_else(|| "commitment node not found in proof".to_string())??;

    Ok(*detached.timestamp() != before)
}

/// Finds the node for `commitment` and merges `subtree` into it.
///
/// Returns `None` when no node matches, so the caller can report a proof that
/// does not actually contain the commitment the calendar answered for.
fn merge_into_node(
    node: &mut Timestamp,
    commitment: &[u8],
    subtree: &Timestamp,
) -> Option<Result<(), String>> {
    if node.msg() == commitment {
        return Some(node.merge(subtree));
    }

    for child in node.ops_mut().values_mut() {
        if let Some(result) = merge_into_node(child, commitment, subtree) {
            return Some(result);
        }
    }

    None
}

/// Result of verifying a proof against the Bitcoin blockchain.
pub struct VerificationOutcome {
    /// True when at least one attestation was checked against a real block.
    pub verified: bool,
    /// Block height of the earliest verified attestation.
    pub block_height: Option<u64>,
    /// Block time of the earliest verified attestation, as RFC 3339.
    pub block_time: Option<String>,
    /// Human-readable notes about what was checked.
    pub notes: Vec<String>,
}

/// Verifies a proof's blockchain attestations against real block headers.
///
/// This is the step that actually proves *when* the file existed: each
/// `BitcoinBlockHeaderAttestation` is checked by fetching the block header at
/// the attested height and confirming the attested commitment is that block's
/// merkle root.
pub fn verify_proof(proof: &[u8]) -> Result<VerificationOutcome, String> {
    let detached = DetachedTimestampFile::deserialize(proof)?;

    let mut notes = Vec::new();
    let mut verified_heights: Vec<(u64, u64)> = Vec::new();

    for (msg, attestation) in detached.timestamp().all_attestations() {
        match attestation {
            Attestation::BitcoinBlockHeader { height } => {
                let header = bitcoin::fetch_block_header(*height)?;
                let time = bitcoin::verify_against_block_header(msg, &header)?;
                notes.push(format!(
                    "Bitcoin block {height} merkle root matches; block time {}",
                    format_unix_time(time)
                ));
                verified_heights.push((*height, time));
            }
            Attestation::LitecoinBlockHeader { height } => {
                notes.push(format!(
                    "Litecoin block {height} attestation present but not verified \
                     (no Litecoin header source configured)"
                ));
            }
            Attestation::Pending { uri } => {
                notes.push(format!("Pending attestation at {uri}; not yet confirmed"));
            }
            Attestation::Unknown { tag, .. } => {
                notes.push(format!(
                    "Unrecognised attestation tag {}; ignored",
                    hex::encode(tag)
                ));
            }
        }
    }

    verified_heights.sort_unstable();

    Ok(VerificationOutcome {
        verified: !verified_heights.is_empty(),
        block_height: verified_heights.first().map(|(height, _)| *height),
        block_time: verified_heights
            .first()
            .map(|(_, time)| format_unix_time(*time)),
        notes,
    })
}

/// Renders a Unix timestamp as RFC 3339, falling back to the raw value.
fn format_unix_time(seconds: u64) -> String {
    chrono::DateTime::from_timestamp(seconds as i64, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| seconds.to_string())
}

/// Resolves the `.ots` proof path for an attachment.
///
/// The proof keeps the attachment's full file name and gains a `.ots` suffix,
/// so `photo.png` and `photo.jpg` in one folder get distinct proofs instead of
/// overwriting each other.
pub fn ots_path_for_attachment(relative_path: &str) -> String {
    format!("{relative_path}.ots")
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

/// Writes the `.ots` proof alongside the attachment and records the timestamp.
///
/// If a record already exists for this attachment it is replaced. That is what
/// lets a proof left behind by an earlier, broken build be re-stamped instead
/// of the attachment being permanently unusable.
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

    // `source_attachment_id` is UNIQUE, so a re-stamp replaces the old row.
    sqlx::query(
        "INSERT INTO source_timestamp (id, source_attachment_id, ots_path, status, created_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(source_attachment_id) DO UPDATE SET
             ots_path = excluded.ots_path,
             status = excluded.status,
             created_at = excluded.created_at,
             confirmed_at = NULL",
    )
    .bind(&id)
    .bind(attachment_id)
    .bind(&ots_path_str)
    .bind(TimestampStatus::Pending.as_db())
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to record timestamp: {e}"))?;

    let id = sqlx::query("SELECT id FROM source_timestamp WHERE source_attachment_id = ?")
        .bind(attachment_id)
        .fetch_one(&pool)
        .await
        .map(|row| row.get::<String, _>("id"))
        .unwrap_or(id);

    Ok(TimestampRecord {
        id,
        source_attachment_id: attachment_id.to_string(),
        ots_path: ots_path_str,
        status: TimestampStatus::Pending,
        created_at: now,
        confirmed_at: None,
        block_height: None,
        block_time: None,
        verification_notes: Vec::new(),
    })
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
        block_height: None,
        block_time: None,
        verification_notes: Vec::new(),
    }))
}

/// Marks a timestamp as confirmed in the database.
pub async fn confirm_timestamp(app: &AppHandle, timestamp_id: &str) -> Result<(), String> {
    let pool = pool::pool(app).await?;
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("UPDATE source_timestamp SET status = 'confirmed', confirmed_at = ? WHERE id = ?")
        .bind(&now)
        .bind(timestamp_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to confirm timestamp: {e}"))?;

    Ok(())
    }

    #[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ots_path_appends_suffix_and_keeps_extension() {
        assert_eq!(
            ots_path_for_attachment("attachments/abc-123/photo.png"),
            "attachments/abc-123/photo.png.ots"
        );
        assert_eq!(
            ots_path_for_attachment("attachments/abc-123/file"),
            "attachments/abc-123/file.ots"
        );
    }

    #[test]
    fn ots_paths_are_distinct_for_same_stem() {
        assert_ne!(
            ots_path_for_attachment("attachments/a/photo.png"),
            ots_path_for_attachment("attachments/a/photo.jpg")
        );
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

            let bytes = compute_sha256_bytes(&file_path).unwrap();
            assert_eq!(
                hex::encode(&bytes),
                "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
            );

            let _ = std::fs::remove_file(&file_path);
        }

    #[test]
    fn stamp_digest_rejects_wrong_length() {
        assert!(stamp_digest(&[0u8; 20]).is_err());
    }

    #[test]
    fn upgrade_of_complete_proof_is_a_no_op() {
        let proof = hex::decode(
            "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294010855087fab0c8f3f89f8bcfd4df26c504d81b0a88e04907161838c0c53001af091000588960d73d719010380ea30",
        )
        .unwrap();

        let outcome = upgrade_proof(&proof).unwrap();
        assert!(!outcome.changed);
        assert!(outcome.complete);
        assert_eq!(outcome.proof, proof);
    }

    #[test]
    fn upgrade_rejects_malformed_proof() {
        assert!(upgrade_proof(b"not a proof").is_err());
    }

    #[test]
    fn verify_rejects_malformed_proof() {
        assert!(verify_proof(b"not a proof").is_err());
    }

        #[test]
        fn summarize_reports_pending_calendars() {
            let proof = hex::decode(
                "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e892940108b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9f0086c9332761dc800d908f010fb3317404f7458252f692308113fe7ac08f120f36a3e7490a06dd7f203777a97d3f450184f1991d2ffc45e6573bcb299adae2f08f020f01347446905f39fdf58af94437ccc75d44e3a6a7209b5ebdd15c7d8fe53f03708f1046af786aaf0088cf84953466ce1720083dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267",
            )
            .unwrap();

            let summary = summarize_proof(&proof).unwrap();
            assert!(!summary.complete);
            assert_eq!(
                summary.calendars,
                vec!["https://alice.btc.calendar.opentimestamps.org"]
            );
            assert_eq!(summary.block_height, None);
        }

        #[test]
        fn summarize_reports_blockchain_attestation() {
            let proof = hex::decode(
                "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294010855087fab0c8f3f89f8bcfd4df26c504d81b0a88e04907161838c0c53001af091000588960d73d719010380ea30",
            )
            .unwrap();

            let summary = summarize_proof(&proof).unwrap();
            assert!(summary.complete);
            assert_eq!(summary.block_height, Some(800_000));
            assert!(summary.calendars.is_empty());
        }

        #[test]
        fn summarize_rejects_malformed_proof() {
            assert!(summarize_proof(b"not a proof").is_err());
        }

        /// A proof written by the previous implementation must be detected as
        /// unusable, because that is what lets the attachment be re-stamped instead
        /// of being permanently stuck with a file nothing can verify.
        #[test]
        fn proof_from_previous_implementation_is_rejected() {
            fn old_build(file_hash_hex: &str, calendar: &str, attestation: &[u8]) -> Vec<u8> {
                let mut ops = vec![0x00u8]; // the old invented version byte
                let hash = hex::decode(file_hash_hex).unwrap();
                ops.push(0x00); // OP_APPEND where the real tag is 0xf0
                ops.extend_from_slice(&hash);
                ops.push(0x01); // OP_SHA256 where the real tag is 0x08

                let cal_hash = Sha256::digest(calendar.as_bytes());
                ops.push(0x00);
                ops.extend_from_slice(&cal_hash);
                ops.push(0x01);

                ops.push(0x02); // a "VERIFY" op that does not exist in the format
                let len = attestation.len() as u16;
                ops.push((len >> 8) as u8);
                ops.push((len & 0xff) as u8);
                ops.extend_from_slice(attestation);
                ops
            }

            let legacy = old_build(
                "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
                "https://alice.btc.calendar.opentimestamps.org",
                b"not a real attestation",
            );

            let err = DetachedTimestampFile::deserialize(&legacy).unwrap_err();
            assert!(
                err.contains("not an OpenTimestamps proof"),
                "legacy proof must be rejected, got: {err}"
            );
            assert!(summarize_proof(&legacy).is_err());
        }

        /// The proof path scheme changed, so a stale `photo.ots` from the old build
        /// can never be mistaken for the proof of `photo.png`.
        #[test]
        fn ots_path_does_not_collide_with_previous_scheme() {
            let path = ots_path_for_attachment("attachments/a/photo.png");
            assert_eq!(path, "attachments/a/photo.png.ots");
            assert_ne!(path, "attachments/a/photo.ots");
        }

    #[test]
    fn format_unix_time_matches_known_block_time() {
            // Bitcoin block 800000 has timestamp 1690168629.
            assert_eq!(format_unix_time(1_690_168_629), "2023-07-24T03:17:09+00:00");
        }
}
