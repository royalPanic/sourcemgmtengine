//! Consensus-critical serialization primitives for the OpenTimestamps format.
//!
//! Mirrors `opentimestamps/core/serialize.py`: unsigned LEB128 varuints,
//! length-prefixed varbytes, and strict end-of-input checking. These rules are
//! part of the proof format, so they must not be "improved" — a proof written
//! with different rules is not an OpenTimestamps proof.

/// Maximum encoded length of a varuint, which limits it to 63 bits.
pub const MAX_VARUINT_BYTES: usize = 9;

/// Reads the OpenTimestamps wire format from a byte slice.
pub struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.buf.len() - self.pos
    }

    pub fn read_exact(&mut self, len: usize) -> Result<&'a [u8], String> {
        let end = self
            .pos
            .checked_add(len)
            .ok_or_else(|| "length overflow while reading".to_string())?;

        if end > self.buf.len() {
            return Err(format!(
                "truncated data: wanted {len} bytes but only {} remain",
                self.remaining()
            ));
        }

        let slice = &self.buf[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    pub fn read_u8(&mut self) -> Result<u8, String> {
        Ok(self.read_exact(1)?[0])
    }

    /// Reads an unsigned little-endian base128 (LEB128) integer.
    pub fn read_varuint(&mut self) -> Result<u64, String> {
        let mut value: u64 = 0;
        let mut shift: u32 = 0;

        for _ in 0..MAX_VARUINT_BYTES {
            let byte = self.read_u8()?;
            value |= ((byte & 0x7f) as u64) << shift;
            if byte & 0x80 == 0 {
                return Ok(value);
            }
            shift += 7;
        }

        Err(format!("varuint exceeds {MAX_VARUINT_BYTES} bytes"))
    }

    /// Reads a varuint-prefixed byte string, rejecting anything over `max_len`.
    pub fn read_varbytes(&mut self, max_len: usize) -> Result<&'a [u8], String> {
        let len = self.read_varuint()? as usize;
        if len > max_len {
            return Err(format!("varbytes length {len} exceeds maximum {max_len}"));
        }
        self.read_exact(len)
    }

    /// Rejects trailing bytes, so a proof cannot smuggle unparsed data.
    pub fn assert_eof(&self) -> Result<(), String> {
        if self.remaining() != 0 {
            return Err(format!(
                "trailing garbage: {} unexpected byte(s) after proof",
                self.remaining()
            ));
        }
        Ok(())
    }
}

/// Writes the OpenTimestamps wire format.
#[derive(Default)]
pub struct Writer {
    buf: Vec<u8>,
}

impl Writer {
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    pub fn write_u8(&mut self, value: u8) {
        self.buf.push(value);
    }

    pub fn write_bytes(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Writes an unsigned little-endian base128 (LEB128) integer.
    pub fn write_varuint(&mut self, mut value: u64) {
        if value == 0 {
            self.buf.push(0);
            return;
        }

        while value != 0 {
            let mut byte = (value & 0x7f) as u8;
            if value > 0x7f {
                byte |= 0x80;
            }
            self.buf.push(byte);
            if value <= 0x7f {
                break;
            }
            value >>= 7;
        }
    }

    pub fn write_varbytes(&mut self, bytes: &[u8]) {
        self.write_varuint(bytes.len() as u64);
        self.write_bytes(bytes);
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.buf
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varuint_round_trips_across_widths() {
        for value in [0u64, 1, 127, 128, 255, 300, 16383, 16384, 1 << 40, u64::MAX >> 1] {
            let mut writer = Writer::new();
            writer.write_varuint(value);
            let bytes = writer.into_bytes();

            let mut reader = Reader::new(&bytes);
            assert_eq!(reader.read_varuint().unwrap(), value, "value {value}");
            reader.assert_eof().unwrap();
        }
    }

    #[test]
    fn varuint_matches_reference_encoding() {
        // LEB128 as produced by python-opentimestamps' write_varuint.
        let cases: &[(u64, &[u8])] = &[
            (0, &[0x00]),
            (127, &[0x7f]),
            (128, &[0x80, 0x01]),
            (300, &[0xac, 0x02]),
            (800_000, &[0x80, 0xea, 0x30]),
        ];

        for (value, expected) in cases {
            let mut writer = Writer::new();
            writer.write_varuint(*value);
            assert_eq!(writer.as_bytes(), *expected, "value {value}");
        }
    }

    #[test]
    fn varbytes_round_trips() {
        let mut writer = Writer::new();
        writer.write_varbytes(b"https://alice.btc.calendar.opentimestamps.org");
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert_eq!(
            reader.read_varbytes(1000).unwrap(),
            b"https://alice.btc.calendar.opentimestamps.org"
        );
        reader.assert_eof().unwrap();
    }

    #[test]
    fn varbytes_rejects_oversized_length() {
        let mut writer = Writer::new();
        writer.write_varbytes(&[0u8; 64]);
        let bytes = writer.into_bytes();

        let mut reader = Reader::new(&bytes);
        assert!(reader.read_varbytes(32).is_err());
    }

    #[test]
    fn truncated_input_is_an_error() {
        let mut reader = Reader::new(&[0x80]);
        assert!(reader.read_varuint().is_err());
    }

    #[test]
    fn trailing_garbage_is_rejected() {
        let reader = Reader::new(&[0x00, 0x01]);
        assert!(reader.assert_eof().is_err());
    }
}
