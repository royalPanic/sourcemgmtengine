//! Bitcoin block header lookup, used to verify blockchain attestations.
//!
//! A `BitcoinBlockHeaderAttestation` records only a block height. Verifying it
//! means fetching that block's header and checking that the attested message is
//! the block's merkle root — exactly what
//! `BitcoinBlockHeaderAttestation.verify_against_blockheader` does in the
//! reference implementation.

use std::time::Duration;

/// A Bitcoin block header, reduced to the fields a timestamp needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockHeader {
    /// Block height.
    pub height: u64,
    /// Merkle root in internal byte order, as it appears in the header.
    pub merkle_root: [u8; 32],
    /// Block timestamp (Unix seconds).
    pub time: u64,
}

/// Block explorers consulted in order. All are public and need no API key.
const EXPLORERS: &[&str] = &["https://blockstream.info/api", "https://mempool.space/api"];

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Fetches the header for `height`, trying each explorer until one answers.
pub fn fetch_block_header(height: u64) -> Result<BlockHeader, String> {
    let mut errors = Vec::new();

    for explorer in EXPLORERS {
        match fetch_from_explorer(explorer, height) {
            Ok(header) => return Ok(header),
            Err(e) => errors.push(format!("{explorer}: {e}")),
        }
    }

    Err(format!(
        "could not fetch Bitcoin block {height} header: {}",
        errors.join("; ")
    ))
}

fn fetch_from_explorer(explorer: &str, height: u64) -> Result<BlockHeader, String> {
    let hash = get_text(&format!("{explorer}/block-height/{height}"))?;
    let hash = hash.trim();
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("unexpected block hash response: {hash:?}"));
    }

    let header_hex = get_text(&format!("{explorer}/block/{hash}/header"))?;
    parse_header(header_hex.trim(), height)
}

fn get_text(url: &str) -> Result<String, String> {
    let response = ureq::get(url)
        .timeout(REQUEST_TIMEOUT)
        .call()
        .map_err(|e| format!("request failed: {e}"))?;

    response
        .into_string()
        .map_err(|e| format!("failed to read response: {e}"))
}

/// Parses an 80-byte block header from hex.
///
/// Layout: version(4) previous(32) merkle_root(32) time(4) bits(4) nonce(4).
/// The merkle root is kept in internal byte order so it can be compared
/// directly against an attested message.
pub fn parse_header(header_hex: &str, height: u64) -> Result<BlockHeader, String> {
    let bytes = hex::decode(header_hex)
        .map_err(|e| format!("block header is not valid hex: {e}"))?;

    if bytes.len() != 80 {
        return Err(format!(
            "block header must be 80 bytes, got {}",
            bytes.len()
        ));
    }

    let mut merkle_root = [0u8; 32];
    merkle_root.copy_from_slice(&bytes[36..68]);

    let time = u32::from_le_bytes(
        bytes[68..72]
            .try_into()
            .map_err(|_| "block header time field is malformed".to_string())?,
    ) as u64;

    Ok(BlockHeader {
        height,
        merkle_root,
        time,
    })
}

/// Checks an attested message against a block header.
///
/// Returns the block time on success, mirroring the reference implementation.
pub fn verify_against_block_header(
    attested_msg: &[u8],
    header: &BlockHeader,
) -> Result<u64, String> {
    if attested_msg.len() != 32 {
        return Err(format!(
            "expected a 32-byte commitment, got {} bytes",
            attested_msg.len()
        ));
    }

    if attested_msg != header.merkle_root {
        return Err(format!(
            "commitment {} is not the merkle root {} of block {}",
            hex::encode(attested_msg),
            hex::encode(header.merkle_root),
            header.height
        ));
    }

    Ok(header.time)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real header for Bitcoin block 800000.
    const HEADER_800000: &str = "00601d3455bb9fbd966b3ea2dc42d0c22722e4c0c1729fad17210100000000000000000055087fab0c8f3f89f8bcfd4df26c504d81b0a88e04907161838c0c53001af09135edbd64943805175e955e06";

    #[test]
    fn parses_real_block_header() {
        let header = parse_header(HEADER_800000, 800_000).unwrap();

        assert_eq!(header.height, 800_000);
        assert_eq!(header.time, 1_690_168_629);
        assert_eq!(
            hex::encode(header.merkle_root),
            "55087fab0c8f3f89f8bcfd4df26c504d81b0a88e04907161838c0c53001af091"
        );
    }

    #[test]
    fn verifies_matching_merkle_root() {
        let header = parse_header(HEADER_800000, 800_000).unwrap();
        let time = verify_against_block_header(&header.merkle_root, &header).unwrap();
        assert_eq!(time, 1_690_168_629);
    }

    #[test]
    fn rejects_mismatched_merkle_root() {
        let header = parse_header(HEADER_800000, 800_000).unwrap();
        let wrong = [0u8; 32];
        let err = verify_against_block_header(&wrong, &header).unwrap_err();
        assert!(err.contains("is not the merkle root"), "{err}");
    }

    #[test]
    fn rejects_wrong_commitment_length() {
        let header = parse_header(HEADER_800000, 800_000).unwrap();
        assert!(verify_against_block_header(&[0u8; 20], &header).is_err());
    }

    #[test]
    fn rejects_malformed_headers() {
        assert!(parse_header("00", 1).is_err());
        assert!(parse_header(&"zz".repeat(80), 1).is_err());
        assert!(parse_header(&"00".repeat(81), 1).is_err());
    }
}
