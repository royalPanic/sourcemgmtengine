//! The OpenTimestamps proof tree and detached `.ots` file container.
//!
//! Mirrors `opentimestamps/core/timestamp.py`. A proof is a tree whose nodes
//! are messages and whose edges are [`Op`]s; the leaves are [`Attestation`]s.
//! Serialization order is part of the format, so nodes are kept in sorted
//! order and written exactly as the reference implementation does.

use std::collections::BTreeMap;

use super::attestation::Attestation;
use super::op::{Op, MAX_MSG_LENGTH};
use super::serialize::{Reader, Writer};

/// Magic bytes at the start of every detached timestamp file.
pub const HEADER_MAGIC: [u8; 31] = [
    0x00, b'O', b'p', b'e', b'n', b'T', b'i', b'm', b'e', b's', b't', b'a', b'm', b'p', b's', 0x00,
    0x00, b'P', b'r', b'o', b'o', b'f', 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
];

/// Only major version 1 of the detached timestamp format is defined.
pub const MAJOR_VERSION: u8 = 1;

/// Shortest permitted file digest (160-bit hash).
pub const MIN_FILE_DIGEST_LENGTH: usize = 20;

/// Longest permitted file digest (256-bit hash).
pub const MAX_FILE_DIGEST_LENGTH: usize = 32;

/// Guards against pathological nesting in a hostile proof.
const RECURSION_LIMIT: usize = 256;

/// Byte that introduces an attestation rather than an operation.
const TAG_ATTESTATION: u8 = 0x00;

/// Byte that separates sibling entries in a node.
const TAG_SEPARATOR: u8 = 0xff;

/// A node in the proof tree: a message, the attestations on it, and the
/// operations leading to further nodes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Timestamp {
    msg: Vec<u8>,
    attestations: Vec<Attestation>,
    ops: BTreeMap<Op, Timestamp>,
}

impl Timestamp {
    pub fn new(msg: Vec<u8>) -> Result<Self, String> {
        if msg.len() > MAX_MSG_LENGTH {
            return Err(format!(
                "message exceeds operation length limit: {} > {MAX_MSG_LENGTH}",
                msg.len()
            ));
        }

        Ok(Self {
            msg,
            attestations: Vec::new(),
            ops: BTreeMap::new(),
        })
    }

    pub fn msg(&self) -> &[u8] {
        &self.msg
    }

    pub fn attestations(&self) -> &[Attestation] {
            &self.attestations
        }

        pub fn ops_mut(&mut self) -> &mut BTreeMap<Op, Timestamp> {
            &mut self.ops
        }

    /// Adds an attestation, ignoring duplicates.
    pub fn add_attestation(&mut self, attestation: Attestation) {
        if !self.attestations.contains(&attestation) {
            self.attestations.push(attestation);
            self.attestations.sort();
        }
    }

    /// Returns the child node for `op`, creating it if absent.
    pub fn child(&mut self, op: &Op) -> Result<&mut Timestamp, String> {
        if !self.ops.contains_key(op) {
            let result = op.apply(&self.msg)?;
            self.ops.insert(op.clone(), Timestamp::new(result)?);
        }

        self.ops
            .get_mut(op)
            .ok_or_else(|| "operation child vanished".to_string())
    }

    /// Merges another timestamp for the same message into this one.
    ///
    /// This is how a calendar's response is folded into a proof: the calendar
    /// returns a subtree rooted at the submitted digest, and merging grafts its
    /// operations and attestations onto the matching node.
    pub fn merge(&mut self, other: &Timestamp) -> Result<(), String> {
        if self.msg != other.msg {
            return Err("cannot merge timestamps for different messages".to_string());
        }

        for attestation in &other.attestations {
            self.add_attestation(attestation.clone());
        }

        for (op, other_child) in &other.ops {
            self.child(op)?.merge(other_child)?;
        }

        Ok(())
    }

    /// Every `(message, attestation)` pair in the tree.
    pub fn all_attestations(&self) -> Vec<(&[u8], &Attestation)> {
        let mut out = Vec::new();
        self.collect_attestations(&mut out);
        out
    }

    fn collect_attestations<'a>(&'a self, out: &mut Vec<(&'a [u8], &'a Attestation)>) {
        for attestation in &self.attestations {
            out.push((&self.msg, attestation));
        }
        for child in self.ops.values() {
            child.collect_attestations(out);
        }
    }

    /// True when at least one attestation is anchored in a blockchain.
    pub fn is_complete(&self) -> bool {
        self.all_attestations()
            .iter()
            .any(|(_, attestation)| attestation.is_blockchain())
    }

    /// The earliest block height attested anywhere in the tree.
    pub fn earliest_block_height(&self) -> Option<u64> {
        self.all_attestations()
            .iter()
            .filter_map(|(_, attestation)| attestation.height())
            .min()
    }

    /// Nodes that carry attestations, which is where upgrades are requested.
    pub fn attested_nodes(&self) -> Vec<&Timestamp> {
        let mut out = Vec::new();
        self.collect_attested_nodes(&mut out);
        out
    }

    fn collect_attested_nodes<'a>(&'a self, out: &mut Vec<&'a Timestamp>) {
        if !self.attestations.is_empty() {
            out.push(self);
        }
        for child in self.ops.values() {
            child.collect_attested_nodes(out);
        }
    }

    pub fn serialize(&self, writer: &mut Writer) -> Result<(), String> {
        if self.attestations.is_empty() && self.ops.is_empty() {
            return Err("an empty timestamp cannot be serialized".to_string());
        }

        // All but the last attestation are written as `0xff 0x00 <attestation>`.
        if self.attestations.len() > 1 {
            for attestation in &self.attestations[..self.attestations.len() - 1] {
                writer.write_u8(TAG_SEPARATOR);
                writer.write_u8(TAG_ATTESTATION);
                attestation.serialize(writer);
            }
        }

        if self.ops.is_empty() {
            // A leaf: `0x00 <attestation>`.
            writer.write_u8(TAG_ATTESTATION);
            self.attestations
                .last()
                .ok_or_else(|| "timestamp has no attestations".to_string())?
                .serialize(writer);
            return Ok(());
        }

        // The final attestation, if any, precedes the operations.
        if let Some(last) = self.attestations.last() {
            writer.write_u8(TAG_SEPARATOR);
            writer.write_u8(TAG_ATTESTATION);
            last.serialize(writer);
        }

        // All but the last operation are prefixed with `0xff`.
        let op_count = self.ops.len();
        for (index, (op, child)) in self.ops.iter().enumerate() {
            if index + 1 < op_count {
                writer.write_u8(TAG_SEPARATOR);
            }
            op.serialize(writer);
            child.serialize(writer)?;
        }

        Ok(())
    }

    pub fn deserialize(reader: &mut Reader<'_>, initial_msg: Vec<u8>) -> Result<Self, String> {
        Self::deserialize_with_limit(reader, initial_msg, RECURSION_LIMIT)
    }

    fn deserialize_with_limit(
        reader: &mut Reader<'_>,
        initial_msg: Vec<u8>,
        recursion_limit: usize,
    ) -> Result<Self, String> {
        if recursion_limit == 0 {
            return Err("reached timestamp recursion depth limit".to_string());
        }

        let mut timestamp = Timestamp::new(initial_msg)?;

        let mut tag = reader.read_u8()?;
        while tag == TAG_SEPARATOR {
            let entry_tag = reader.read_u8()?;
            timestamp.read_entry(reader, entry_tag, recursion_limit)?;
            tag = reader.read_u8()?;
        }

        timestamp.read_entry(reader, tag, recursion_limit)?;
        Ok(timestamp)
    }

    fn read_entry(
        &mut self,
        reader: &mut Reader<'_>,
        tag: u8,
        recursion_limit: usize,
    ) -> Result<(), String> {
        if tag == TAG_ATTESTATION {
            let attestation = Attestation::deserialize(reader)?;
            self.add_attestation(attestation);
            return Ok(());
        }

        let op = Op::deserialize_from_tag(reader, tag)?;
        if self.ops.contains_key(&op) {
            return Err(format!("invalid timestamp: operation 0x{tag:02x} repeated"));
        }

        let result = op.apply(&self.msg)?;
        let child =
            Timestamp::deserialize_with_limit(reader, result, recursion_limit - 1)?;
        self.ops.insert(op, child);
        Ok(())
    }
}

/// A `.ots` file: a file digest plus the proof tree committing to it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetachedTimestampFile {
    file_hash_op: Op,
    timestamp: Timestamp,
}

impl DetachedTimestampFile {
    /// Creates a detached timestamp for a file digest.
    pub fn new(file_hash_op: Op, file_digest: Vec<u8>) -> Result<Self, String> {
        if !matches!(file_hash_op, Op::Sha1 | Op::Ripemd160 | Op::Sha256) {
            return Err("file hash operation must be a cryptographic hash".to_string());
        }

        let expected = digest_length(&file_hash_op)
            .ok_or_else(|| "file hash operation has no digest length".to_string())?;

        if file_digest.len() != expected {
            return Err(format!(
                "file digest length {} does not match hash digest length {expected}",
                file_digest.len()
            ));
        }

        Ok(Self {
            file_hash_op,
            timestamp: Timestamp::new(file_digest)?,
        })
    }

    /// The hash operation the digest was produced with.
        #[cfg(test)]
        pub fn file_hash_op(&self) -> &Op {
            &self.file_hash_op
        }

    pub fn file_digest(&self) -> &[u8] {
        self.timestamp.msg()
    }

    pub fn timestamp(&self) -> &Timestamp {
        &self.timestamp
    }

    pub fn timestamp_mut(&mut self) -> &mut Timestamp {
        &mut self.timestamp
    }

    pub fn serialize(&self) -> Result<Vec<u8>, String> {
        let mut writer = Writer::new();
        writer.write_bytes(&HEADER_MAGIC);
        writer.write_u8(MAJOR_VERSION);
        self.file_hash_op.serialize(&mut writer);
        writer.write_bytes(self.file_digest());
        self.timestamp.serialize(&mut writer)?;
        Ok(writer.into_bytes())
    }

    pub fn deserialize(bytes: &[u8]) -> Result<Self, String> {
        let mut reader = Reader::new(bytes);

        let magic = reader.read_exact(HEADER_MAGIC.len())?;
        if magic != HEADER_MAGIC {
            return Err(format!(
                "not an OpenTimestamps proof: expected magic {}, got {}",
                hex::encode(HEADER_MAGIC),
                hex::encode(magic)
            ));
        }

        let major = reader.read_u8()?;
        if major != MAJOR_VERSION {
            return Err(format!(
                "unsupported OpenTimestamps major version {major}"
            ));
        }

        let file_hash_op = Op::deserialize(&mut reader)?;
        let digest_len = digest_length(&file_hash_op)
            .ok_or_else(|| "file hash operation must be a cryptographic hash".to_string())?;

        if !(MIN_FILE_DIGEST_LENGTH..=MAX_FILE_DIGEST_LENGTH).contains(&digest_len) {
            return Err(format!("unsupported file digest length {digest_len}"));
        }

        let digest = reader.read_exact(digest_len)?.to_vec();
        let timestamp = Timestamp::deserialize(&mut reader, digest)?;
        reader.assert_eof()?;

        Ok(Self {
            file_hash_op,
            timestamp,
        })
    }
}

/// Digest length of a cryptographic hash operation.
fn digest_length(op: &Op) -> Option<usize> {
    match op {
        Op::Sha1 | Op::Ripemd160 => Some(20),
        Op::Sha256 | Op::Keccak256 => Some(32),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opentimestamps::attestation::{TAG_BITCOIN, TAG_PENDING};

    /// A real calendar response for the SHA-256 of "hello world", captured from
    /// alice.btc.calendar.opentimestamps.org.
    const CALENDAR_RESPONSE: &str = "f0086c9332761dc800d908f010fb3317404f7458252f692308113fe7ac08f120f36a3e7490a06dd7f203777a97d3f450184f1991d2ffc45e6573bcb299adae2f08f020f01347446905f39fdf58af94437ccc75d44e3a6a7209b5ebdd15c7d8fe53f03708f1046af786aaf0088cf84953466ce1720083dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267";

    /// The same proof as serialized by python-opentimestamps.
    const PENDING_PROOF: &str = "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e892940108b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9f0086c9332761dc800d908f010fb3317404f7458252f692308113fe7ac08f120f36a3e7490a06dd7f203777a97d3f450184f1991d2ffc45e6573bcb299adae2f08f020f01347446905f39fdf58af94437ccc75d44e3a6a7209b5ebdd15c7d8fe53f03708f1046af786aaf0088cf84953466ce1720083dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267";

    /// A complete proof for block 800000's merkle root, as serialized by
    /// python-opentimestamps.
    const BITCOIN_PROOF: &str = "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294010855087fab0c8f3f89f8bcfd4df26c504d81b0a88e04907161838c0c53001af091000588960d73d719010380ea30";

    fn hello_world_digest() -> Vec<u8> {
        hex::decode("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9").unwrap()
    }

    #[test]
    fn calendar_response_parses_and_merges_into_reference_proof() {
        let digest = hello_world_digest();

        let response = hex::decode(CALENDAR_RESPONSE).unwrap();
        let mut reader = Reader::new(&response);
        let calendar_timestamp = Timestamp::deserialize(&mut reader, digest.clone()).unwrap();
        reader.assert_eof().unwrap();

        let mut detached = DetachedTimestampFile::new(Op::Sha256, digest).unwrap();
        detached.timestamp_mut().merge(&calendar_timestamp).unwrap();

        assert_eq!(hex::encode(detached.serialize().unwrap()), PENDING_PROOF);
    }

    #[test]
    fn reference_pending_proof_round_trips() {
        let bytes = hex::decode(PENDING_PROOF).unwrap();
        let detached = DetachedTimestampFile::deserialize(&bytes).unwrap();

        assert_eq!(detached.file_hash_op(), &Op::Sha256);
        assert_eq!(detached.file_digest(), hello_world_digest().as_slice());
        assert!(!detached.timestamp().is_complete());

        let attestations = detached.timestamp().all_attestations();
        assert_eq!(attestations.len(), 1);
        assert_eq!(
            attestations[0].1.pending_uri(),
            Some("https://alice.btc.calendar.opentimestamps.org")
        );

        assert_eq!(hex::encode(detached.serialize().unwrap()), PENDING_PROOF);
    }

    #[test]
    fn reference_bitcoin_proof_round_trips() {
        let bytes = hex::decode(BITCOIN_PROOF).unwrap();
        let detached = DetachedTimestampFile::deserialize(&bytes).unwrap();

        assert!(detached.timestamp().is_complete());
        assert_eq!(detached.timestamp().earliest_block_height(), Some(800_000));

        let attestations = detached.timestamp().all_attestations();
        assert_eq!(attestations.len(), 1);
        assert_eq!(attestations[0].1.tag(), TAG_BITCOIN);

        assert_eq!(hex::encode(detached.serialize().unwrap()), BITCOIN_PROOF);
    }

    #[test]
    fn merge_is_idempotent() {
        let bytes = hex::decode(PENDING_PROOF).unwrap();
        let mut detached = DetachedTimestampFile::deserialize(&bytes).unwrap();
        let original = detached.serialize().unwrap();

        let other = DetachedTimestampFile::deserialize(&bytes).unwrap();
        detached
            .timestamp_mut()
            .merge(other.timestamp())
            .unwrap();

        assert_eq!(detached.serialize().unwrap(), original);
    }

    #[test]
    fn merge_rejects_different_messages() {
        let mut a = Timestamp::new(vec![1, 2, 3]).unwrap();
        let b = Timestamp::new(vec![4, 5, 6]).unwrap();
        assert!(a.merge(&b).is_err());
    }

    #[test]
    fn empty_timestamp_cannot_be_serialized() {
        let timestamp = Timestamp::new(vec![0u8; 32]).unwrap();
        let mut writer = Writer::new();
        assert!(timestamp.serialize(&mut writer).is_err());
    }

    #[test]
    fn bad_magic_is_rejected() {
        let mut bytes = hex::decode(PENDING_PROOF).unwrap();
        bytes[1] = b'X';
        let err = DetachedTimestampFile::deserialize(&bytes).unwrap_err();
        assert!(err.contains("not an OpenTimestamps proof"), "{err}");
    }

    #[test]
    fn unsupported_major_version_is_rejected() {
        let mut bytes = hex::decode(PENDING_PROOF).unwrap();
        bytes[HEADER_MAGIC.len()] = 2;
        let err = DetachedTimestampFile::deserialize(&bytes).unwrap_err();
        assert!(err.contains("unsupported"), "{err}");
    }

    #[test]
    fn trailing_garbage_is_rejected() {
        let mut bytes = hex::decode(PENDING_PROOF).unwrap();
        bytes.push(0x00);
        assert!(DetachedTimestampFile::deserialize(&bytes).is_err());
    }

    #[test]
    fn truncated_proof_is_rejected() {
        let bytes = hex::decode(PENDING_PROOF).unwrap();
        for cut in [HEADER_MAGIC.len(), 40, bytes.len() - 1] {
            assert!(
                DetachedTimestampFile::deserialize(&bytes[..cut]).is_err(),
                "truncation at {cut} should fail"
            );
        }
    }

    #[test]
    fn non_cryptographic_file_hash_op_is_rejected() {
        assert!(DetachedTimestampFile::new(Op::Append(vec![1]), vec![0u8; 32]).is_err());
        assert!(DetachedTimestampFile::new(Op::Sha256, vec![0u8; 20]).is_err());
    }

    #[test]
    fn attestation_tags_are_distinct() {
        assert_ne!(TAG_PENDING, TAG_BITCOIN);
    }
}
