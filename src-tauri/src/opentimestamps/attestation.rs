//! OpenTimestamps time attestations.
//!
//! An attestation is a leaf in the proof tree: a claim that a message existed
//! before some point in time. Mirrors `opentimestamps/core/notary.py`.

use super::serialize::{Reader, Writer};

/// Attestation tags are always 8 bytes.
pub const TAG_SIZE: usize = 8;

/// Maximum size of an attestation payload.
pub const MAX_PAYLOAD_SIZE: usize = 8192;

/// Maximum block height a blockchain attestation may record.
pub const MAX_HEIGHT: u64 = u32::MAX as u64;

/// `PendingAttestation`: the commitment is held by a remote calendar and will
/// be attested once the calendar's aggregation transaction confirms.
pub const TAG_PENDING: [u8; TAG_SIZE] = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];

/// `BitcoinBlockHeaderAttestation`: the commitment is a Bitcoin merkle root.
pub const TAG_BITCOIN: [u8; TAG_SIZE] = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];

/// `LitecoinBlockHeaderAttestation`: the commitment is a Litecoin merkle root.
pub const TAG_LITECOIN: [u8; TAG_SIZE] = [0x06, 0x86, 0x9a, 0x0d, 0x73, 0xd7, 0x1b, 0x45];

/// Maximum legal URI length, in bytes.
pub const MAX_URI_LENGTH: usize = 1000;

/// Characters allowed in a pending attestation's URI.
///
/// Deliberately excludes the characters needed for parameters, queries,
/// fragments, IPv6 brackets, percent-encoding, and `@` login notation.
const ALLOWED_URI_CHARS: &[u8] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._/:";

/// A time attestation.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Attestation {
    /// Held by a remote calendar; `uri` is where to ask for an upgrade.
    Pending { uri: String },
    /// Confirmed in a Bitcoin block at `height`.
    BitcoinBlockHeader { height: u64 },
    /// Confirmed in a Litecoin block at `height`.
    LitecoinBlockHeader { height: u64 },
    /// An attestation type this build does not understand, preserved verbatim
    /// so a proof round-trips without losing data.
    Unknown { tag: [u8; TAG_SIZE], payload: Vec<u8> },
}

impl Attestation {
    pub fn tag(&self) -> [u8; TAG_SIZE] {
        match self {
            Attestation::Pending { .. } => TAG_PENDING,
            Attestation::BitcoinBlockHeader { .. } => TAG_BITCOIN,
            Attestation::LitecoinBlockHeader { .. } => TAG_LITECOIN,
            Attestation::Unknown { tag, .. } => *tag,
        }
    }

    /// True once the attestation is anchored in a blockchain, which is what
    /// makes a timestamp independently verifiable.
    pub fn is_blockchain(&self) -> bool {
        matches!(
            self,
            Attestation::BitcoinBlockHeader { .. } | Attestation::LitecoinBlockHeader { .. }
        )
    }

    /// The block height for a blockchain attestation.
    pub fn height(&self) -> Option<u64> {
        match self {
            Attestation::BitcoinBlockHeader { height }
            | Attestation::LitecoinBlockHeader { height } => Some(*height),
            _ => None,
        }
    }

    /// The calendar URI for a pending attestation.
    pub fn pending_uri(&self) -> Option<&str> {
        match self {
            Attestation::Pending { uri } => Some(uri),
            _ => None,
        }
    }

    fn serialize_payload(&self, writer: &mut Writer) {
        match self {
            Attestation::Pending { uri } => writer.write_varbytes(uri.as_bytes()),
            Attestation::BitcoinBlockHeader { height }
            | Attestation::LitecoinBlockHeader { height } => writer.write_varuint(*height),
            Attestation::Unknown { payload, .. } => writer.write_bytes(payload),
        }
    }

    pub fn serialize(&self, writer: &mut Writer) {
        writer.write_bytes(&self.tag());

        let mut payload = Writer::new();
        self.serialize_payload(&mut payload);
        writer.write_varbytes(payload.as_bytes());
    }

    pub fn deserialize(reader: &mut Reader<'_>) -> Result<Self, String> {
        let tag: [u8; TAG_SIZE] = reader
            .read_exact(TAG_SIZE)?
            .try_into()
            .map_err(|_| "attestation tag must be 8 bytes".to_string())?;

        let payload = reader.read_varbytes(MAX_PAYLOAD_SIZE)?.to_vec();

        match tag {
            TAG_PENDING => {
                let mut payload_reader = Reader::new(&payload);
                let uri_bytes = payload_reader.read_varbytes(MAX_URI_LENGTH)?;
                check_uri(uri_bytes)?;
                let uri = String::from_utf8(uri_bytes.to_vec())
                    .map_err(|e| format!("pending attestation URI is not UTF-8: {e}"))?;
                payload_reader.assert_eof()?;
                Ok(Attestation::Pending { uri })
            }
            TAG_BITCOIN | TAG_LITECOIN => {
                let mut payload_reader = Reader::new(&payload);
                let height = payload_reader.read_varuint()?;
                if height > MAX_HEIGHT {
                    return Err(format!("block height {height} exceeds maximum {MAX_HEIGHT}"));
                }
                payload_reader.assert_eof()?;
                Ok(if tag == TAG_BITCOIN {
                    Attestation::BitcoinBlockHeader { height }
                } else {
                    Attestation::LitecoinBlockHeader { height }
                })
            }
            _ => Ok(Attestation::Unknown { tag, payload }),
        }
    }
}

/// Validates a pending attestation URI against the format's character set.
fn check_uri(uri: &[u8]) -> Result<(), String> {
    if uri.len() > MAX_URI_LENGTH {
        return Err(format!(
            "pending attestation URI exceeds {MAX_URI_LENGTH} bytes"
        ));
    }

    for &byte in uri {
        if !ALLOWED_URI_CHARS.contains(&byte) {
            return Err(format!(
                "pending attestation URI contains invalid character 0x{byte:02x}"
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_attestation_round_trips() {
        let attestation = Attestation::Pending {
            uri: "https://alice.btc.calendar.opentimestamps.org".to_string(),
        };

        let mut writer = Writer::new();
        attestation.serialize(&mut writer);
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert_eq!(Attestation::deserialize(&mut reader).unwrap(), attestation);
        reader.assert_eof().unwrap();
    }

    #[test]
    fn bitcoin_attestation_round_trips() {
        let attestation = Attestation::BitcoinBlockHeader { height: 800_000 };

        let mut writer = Writer::new();
        attestation.serialize(&mut writer);
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert_eq!(Attestation::deserialize(&mut reader).unwrap(), attestation);
        reader.assert_eof().unwrap();
    }

    #[test]
    fn bitcoin_attestation_matches_reference_bytes() {
        // From python-opentimestamps: tag 0588960d73d71901, varbytes(80ea30).
        let attestation = Attestation::BitcoinBlockHeader { height: 800_000 };
        let mut writer = Writer::new();
        attestation.serialize(&mut writer);
        assert_eq!(hex::encode(writer.as_bytes()), "0588960d73d719010380ea30");
    }

    #[test]
    fn pending_attestation_matches_reference_bytes() {
        let attestation = Attestation::Pending {
            uri: "https://alice.btc.calendar.opentimestamps.org".to_string(),
        };
        let mut writer = Writer::new();
        attestation.serialize(&mut writer);
        assert_eq!(
            hex::encode(writer.as_bytes()),
            "83dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267"
        );
    }

    #[test]
    fn unknown_attestation_is_preserved() {
        let attestation = Attestation::Unknown {
            tag: [0xaa; TAG_SIZE],
            payload: vec![1, 2, 3],
        };

        let mut writer = Writer::new();
        attestation.serialize(&mut writer);
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert_eq!(Attestation::deserialize(&mut reader).unwrap(), attestation);
    }

    #[test]
    fn uri_with_query_string_is_rejected() {
        assert!(check_uri(b"https://example.com/?a=b").is_err());
        assert!(check_uri(b"https://example.com/path").is_ok());
    }

    #[test]
    fn oversized_height_is_rejected() {
        let mut payload = Writer::new();
        payload.write_varuint(MAX_HEIGHT + 1);

        let mut writer = Writer::new();
        writer.write_bytes(&TAG_BITCOIN);
        writer.write_varbytes(payload.as_bytes());

        let bytes = writer.into_bytes();
        let mut reader = Reader::new(&bytes);
        assert!(Attestation::deserialize(&mut reader).is_err());
    }

    #[test]
    fn blockchain_predicates() {
        assert!(Attestation::BitcoinBlockHeader { height: 1 }.is_blockchain());
        assert!(!Attestation::Pending {
            uri: "https://a.b".into()
        }
        .is_blockchain());
        assert_eq!(
            Attestation::BitcoinBlockHeader { height: 7 }.height(),
            Some(7)
        );
        assert_eq!(
            Attestation::Pending {
                uri: "https://a.b".into()
            }
            .pending_uri(),
            Some("https://a.b")
        );
    }
}
