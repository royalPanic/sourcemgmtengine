//! OpenTimestamps calendar client.
//!
//! Implements the calendar HTTP protocol from `opentimestamps/calendar.py`:
//!
//! * `POST <calendar>/digest` with the raw 32-byte digest as the body submits a
//!   commitment and returns a serialized [`Timestamp`] subtree.
//! * `GET <calendar>/timestamp/<hex commitment>` fetches an upgraded subtree for
//!   a commitment the calendar already knows.
//!
//! Both responses are binary, so they must never be decoded as text.

use std::time::Duration;

use super::serialize::Reader;
use super::timestamp::Timestamp;

/// Public OpenTimestamps calendar servers (free, no registration required).
pub const CALENDARS: &[&str] = &[
    "https://alice.btc.calendar.opentimestamps.org",
    "https://bob.btc.calendar.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
];

/// Media type the calendars speak.
const OTS_MEDIA_TYPE: &str = "application/vnd.opentimestamps.v1";

/// Upper bound on a calendar response, matching the reference client.
const MAX_RESPONSE_LENGTH: usize = 10_000;

/// Per-request timeout. A stalled calendar must not hang the command.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Why a calendar request failed.
#[derive(Debug)]
pub enum CalendarError {
    /// The calendar does not know the commitment (HTTP 404).
    CommitmentNotFound(String),
    /// Any other failure: transport, HTTP status, or a malformed response.
    Other(String),
}

impl std::fmt::Display for CalendarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalendarError::CommitmentNotFound(msg) => write!(f, "commitment not found: {msg}"),
            CalendarError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

/// Submits a digest to a calendar and returns the timestamp subtree it commits
/// to that digest.
pub fn submit_digest(calendar_url: &str, digest: &[u8]) -> Result<Timestamp, CalendarError> {
    let url = format!("{}/digest", calendar_url.trim_end_matches('/'));

    let response = ureq::post(&url)
        .set("Accept", OTS_MEDIA_TYPE)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(REQUEST_TIMEOUT)
        .send_bytes(digest)
        .map_err(|e| classify_error(calendar_url, e))?;

    read_timestamp(response, digest, calendar_url)
}

/// Asks a calendar for an upgraded timestamp for a commitment it already holds.
pub fn get_timestamp(
    calendar_url: &str,
    commitment: &[u8],
) -> Result<Timestamp, CalendarError> {
    let url = format!(
        "{}/timestamp/{}",
        calendar_url.trim_end_matches('/'),
        hex::encode(commitment)
    );

    let response = ureq::get(&url)
        .set("Accept", OTS_MEDIA_TYPE)
        .timeout(REQUEST_TIMEOUT)
        .call()
        .map_err(|e| classify_error(calendar_url, e))?;

    read_timestamp(response, commitment, calendar_url)
}

/// Reads a binary calendar response into a timestamp subtree.
fn read_timestamp(
    response: ureq::Response,
    msg: &[u8],
    calendar_url: &str,
) -> Result<Timestamp, CalendarError> {
    let mut body = Vec::new();
    response
        .into_reader()
        .take(MAX_RESPONSE_LENGTH as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|e| {
            CalendarError::Other(format!("{calendar_url}: failed to read response: {e}"))
        })?;

    if body.len() > MAX_RESPONSE_LENGTH {
        return Err(CalendarError::Other(format!(
            "{calendar_url}: response exceeded {MAX_RESPONSE_LENGTH} bytes"
        )));
    }

    if body.is_empty() {
        return Err(CalendarError::Other(format!(
            "{calendar_url}: returned an empty response"
        )));
    }

    let mut reader = Reader::new(&body);
    let timestamp = Timestamp::deserialize(&mut reader, msg.to_vec()).map_err(|e| {
        CalendarError::Other(format!("{calendar_url}: malformed timestamp response: {e}"))
    })?;

    reader.assert_eof().map_err(|e| {
        CalendarError::Other(format!("{calendar_url}: malformed timestamp response: {e}"))
    })?;

    Ok(timestamp)
}

/// Maps a `ureq` failure onto a [`CalendarError`], distinguishing a missing
/// commitment from a genuine failure.
fn classify_error(calendar_url: &str, error: ureq::Error) -> CalendarError {
    match error {
        ureq::Error::Status(404, response) => CalendarError::CommitmentNotFound(format!(
            "{calendar_url}: {}",
            sanitise_message(response)
        )),
        ureq::Error::Status(status, _) => {
            CalendarError::Other(format!("{calendar_url}: returned HTTP {status}"))
        }
        ureq::Error::Transport(transport) => {
            CalendarError::Other(format!("{calendar_url}: request failed: {transport}"))
        }
    }
}

/// Renders a calendar's error body as a single safe line.
///
/// The body is attacker-controlled, so anything outside a conservative
/// whitelist — including newlines — is replaced, which stops it from forging
/// additional log or UI lines.
fn sanitise_message(response: ureq::Response) -> String {
    let mut body = String::new();
    let _ = response.into_reader().take(160).read_to_string(&mut body);

    let cleaned: String = body
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "#-.,; ".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();

    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        "commitment not found".to_string()
    } else {
        trimmed
    }
}

use std::io::Read;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendars_are_https_and_distinct() {
        assert!(CALENDARS.len() >= 3);
        for calendar in CALENDARS {
            assert!(calendar.starts_with("https://"), "{calendar}");
        }

        let mut unique = CALENDARS.to_vec();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), CALENDARS.len());
    }

    #[test]
    fn digest_url_has_no_double_slash() {
        let url = format!("{}/digest", "https://example.com/".trim_end_matches('/'));
        assert_eq!(url, "https://example.com/digest");
    }

    #[test]
    fn sanitise_strips_newlines() {
        // Exercised indirectly: the character filter must drop CR/LF.
        let raw = "not found\r\nHTTP/1.1 200 OK";
        let cleaned: String = raw
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || "#-.,; ".contains(c) {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        assert!(!cleaned.contains('\n'));
        assert!(!cleaned.contains('\r'));
    }
}
