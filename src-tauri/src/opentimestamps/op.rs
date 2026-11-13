//! OpenTimestamps commitment operations.
//!
//! An operation is an edge in the proof tree: it transforms a message into a
//! new message. Tags are taken from RFC 4880 where they overlap, matching
//! `opentimestamps/core/op.py`.

use super::serialize::{Reader, Writer};
use ripemd::Ripemd160;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use sha3::Keccak256;

/// Maximum length of a message an operation may be applied to.
pub const MAX_MSG_LENGTH: usize = 4096;

/// Maximum length of an operation's result.
pub const MAX_RESULT_LENGTH: usize = 4096;

/// Maximum length of a binary operation's argument.
pub const MAX_ARG_LENGTH: usize = MAX_RESULT_LENGTH;

pub const TAG_APPEND: u8 = 0xf0;
pub const TAG_PREPEND: u8 = 0xf1;
pub const TAG_REVERSE: u8 = 0xf2;
pub const TAG_HEXLIFY: u8 = 0xf3;
pub const TAG_SHA1: u8 = 0x02;
pub const TAG_RIPEMD160: u8 = 0x03;
pub const TAG_SHA256: u8 = 0x08;
pub const TAG_KECCAK256: u8 = 0x67;

/// A commitment operation.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Op {
    /// Append a suffix to the message.
    Append(Vec<u8>),
    /// Prepend a prefix to the message.
    Prepend(Vec<u8>),
    /// Reverse the message bytes.
    Reverse,
    /// Convert the message to lower-case hexadecimal.
    Hexlify,
    /// SHA-1 digest.
    Sha1,
    /// RIPEMD-160 digest.
    Ripemd160,
    /// SHA-256 digest.
    Sha256,
    /// Keccak-256 digest.
    Keccak256,
}

impl Op {
    /// The single-byte tag identifying this operation on the wire.
    pub fn tag(&self) -> u8 {
        match self {
            Op::Append(_) => TAG_APPEND,
            Op::Prepend(_) => TAG_PREPEND,
            Op::Reverse => TAG_REVERSE,
            Op::Hexlify => TAG_HEXLIFY,
            Op::Sha1 => TAG_SHA1,
            Op::Ripemd160 => TAG_RIPEMD160,
            Op::Sha256 => TAG_SHA256,
            Op::Keccak256 => TAG_KECCAK256,
        }
    }

    /// Applies the operation, enforcing the format's length limits.
    pub fn apply(&self, msg: &[u8]) -> Result<Vec<u8>, String> {
        if msg.len() > MAX_MSG_LENGTH {
            return Err(format!(
                "message too long for operation: {} > {MAX_MSG_LENGTH}",
                msg.len()
            ));
        }

        let result = match self {
            Op::Append(arg) => {
                let mut out = Vec::with_capacity(msg.len() + arg.len());
                out.extend_from_slice(msg);
                out.extend_from_slice(arg);
                out
            }
            Op::Prepend(arg) => {
                let mut out = Vec::with_capacity(arg.len() + msg.len());
                out.extend_from_slice(arg);
                out.extend_from_slice(msg);
                out
            }
            Op::Reverse => {
                if msg.is_empty() {
                    return Err("cannot reverse an empty message".to_string());
                }
                msg.iter().rev().copied().collect()
            }
            Op::Hexlify => {
                if msg.is_empty() {
                    return Err("cannot hexlify an empty message".to_string());
                }
                hex::encode(msg).into_bytes()
            }
            Op::Sha1 => Sha1::digest(msg).to_vec(),
            Op::Ripemd160 => Ripemd160::digest(msg).to_vec(),
            Op::Sha256 => Sha256::digest(msg).to_vec(),
            Op::Keccak256 => Keccak256::digest(msg).to_vec(),
        };

        if result.is_empty() {
            return Err("operation produced an empty result".to_string());
        }
        if result.len() > MAX_RESULT_LENGTH {
            return Err(format!(
                "operation result too long: {} > {MAX_RESULT_LENGTH}",
                result.len()
            ));
        }

        Ok(result)
    }

    pub fn serialize(&self, writer: &mut Writer) {
        writer.write_u8(self.tag());
        match self {
            Op::Append(arg) | Op::Prepend(arg) => writer.write_varbytes(arg),
            _ => {}
        }
    }

    /// Reads an operation whose tag byte has already been consumed.
    pub fn deserialize_from_tag(reader: &mut Reader<'_>, tag: u8) -> Result<Self, String> {
        match tag {
            TAG_APPEND => Ok(Op::Append(reader.read_varbytes(MAX_ARG_LENGTH)?.to_vec())),
            TAG_PREPEND => Ok(Op::Prepend(reader.read_varbytes(MAX_ARG_LENGTH)?.to_vec())),
            TAG_REVERSE => Ok(Op::Reverse),
            TAG_HEXLIFY => Ok(Op::Hexlify),
            TAG_SHA1 => Ok(Op::Sha1),
            TAG_RIPEMD160 => Ok(Op::Ripemd160),
            TAG_SHA256 => Ok(Op::Sha256),
            TAG_KECCAK256 => Ok(Op::Keccak256),
            other => Err(format!("unknown operation tag 0x{other:02x}")),
        }
    }

    /// Reads a full operation, including its tag byte.
    pub fn deserialize(reader: &mut Reader<'_>) -> Result<Self, String> {
        let tag = reader.read_u8()?;
        Self::deserialize_from_tag(reader, tag)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_known_digest() {
        let digest = Op::Sha256.apply(b"hello world").unwrap();
        assert_eq!(
            hex::encode(digest),
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn sha1_and_ripemd160_have_expected_lengths() {
        assert_eq!(Op::Sha1.apply(b"abc").unwrap().len(), 20);
        assert_eq!(Op::Ripemd160.apply(b"abc").unwrap().len(), 20);
        assert_eq!(Op::Keccak256.apply(b"abc").unwrap().len(), 32);
    }

    #[test]
    fn append_and_prepend_concatenate() {
        assert_eq!(Op::Append(b"def".to_vec()).apply(b"abc").unwrap(), b"abcdef");
        assert_eq!(Op::Prepend(b"abc".to_vec()).apply(b"def").unwrap(), b"abcdef");
    }

    #[test]
    fn hexlify_lowercases_and_doubles_length() {
        assert_eq!(Op::Hexlify.apply(&[0xab, 0xcd]).unwrap(), b"abcd");
        assert!(Op::Hexlify.apply(b"").is_err());
    }

    #[test]
    fn reverse_rejects_empty_message() {
        assert_eq!(Op::Reverse.apply(b"abc").unwrap(), b"cba");
        assert!(Op::Reverse.apply(b"").is_err());
    }

    #[test]
    fn oversized_message_is_rejected() {
        let big = vec![0u8; MAX_MSG_LENGTH + 1];
        assert!(Op::Sha256.apply(&big).is_err());
    }

    #[test]
    fn tags_match_reference_values() {
        assert_eq!(Op::Append(vec![1]).tag(), 0xf0);
        assert_eq!(Op::Prepend(vec![1]).tag(), 0xf1);
        assert_eq!(Op::Reverse.tag(), 0xf2);
        assert_eq!(Op::Hexlify.tag(), 0xf3);
        assert_eq!(Op::Sha1.tag(), 0x02);
        assert_eq!(Op::Ripemd160.tag(), 0x03);
        assert_eq!(Op::Sha256.tag(), 0x08);
        assert_eq!(Op::Keccak256.tag(), 0x67);
    }

    #[test]
    fn binary_op_round_trips() {
        let op = Op::Append(vec![0xde, 0xad, 0xbe, 0xef]);
        let mut writer = Writer::new();
        op.serialize(&mut writer);
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert_eq!(Op::deserialize(&mut reader).unwrap(), op);
        reader.assert_eof().unwrap();
    }

    #[test]
    fn unary_op_round_trips() {
        for op in [
            Op::Sha256,
            Op::Sha1,
            Op::Ripemd160,
            Op::Keccak256,
            Op::Reverse,
            Op::Hexlify,
        ] {
            let mut writer = Writer::new();
            op.serialize(&mut writer);
            let bytes = writer.into_bytes();

            let mut reader = Reader::new(&bytes);
            assert_eq!(Op::deserialize(&mut reader).unwrap(), op);
        }
    }

    #[test]
    fn unknown_tag_is_rejected() {
        let mut reader = Reader::new(&[0x42]);
        assert!(Op::deserialize(&mut reader).is_err());
    }
}
