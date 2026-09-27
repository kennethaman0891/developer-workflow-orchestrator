//! `Content-Length` framed JSON-RPC 2.0 messages (the LSP wire format).
//!
//! A language server on stdio speaks newline-framed *headers* followed by an
//! exact number of body bytes:
//!
//! ```text
//! Content-Length: 42\r\n
//! Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n
//! \r\n
//! {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
//! ```
//!
//! Two properties make a naive "read a line, parse JSON" reader wrong and are
//! exactly what [`FrameReader`] handles:
//!
//! * **Frames split across reads** — a single `read()` may stop in the middle of
//!   the header *or* in the middle of the body, so bytes must be buffered until
//!   `Content-Length` bytes of body are available.
//! * **Multiple frames per read** — one `read()` may carry several complete
//!   messages (and a trailing partial one), so the buffer must be drained in a
//!   loop.
//!
//! Bad input is *reported, then recovered from*: an unusable header block is
//! dropped so the stream can resync on the next valid frame. One malformed
//! message must never wedge a live language server session.
//!
//! The write side is [`encode_frame`]: serialize the message to JSON and prefix
//! it with `Content-Length: <byte len>\r\n\r\n`. No external crate — the format
//! is ~30 lines of byte scanning.

use std::fmt;

/// Hard cap on the header block (`Content-Length: N\r\n\r\n…`).
///
/// A server that never terminates its headers, or emits a megabyte of them, is
/// either broken or hostile; either way the bytes are dropped rather than
/// buffered forever.
pub const MAX_HEADER_BYTES: usize = 8 * 1024;

/// Hard cap on a single message body.
///
/// Diagnostic payloads for a large file are tens of kilobytes; 32 MiB leaves
/// orders of magnitude of headroom while still bounding what one bad
/// `Content-Length` value can make us allocate.
pub const MAX_FRAME_BYTES: usize = 32 * 1024 * 1024;

/// A framing failure. Deliberately non-fatal: the reader reports it and keeps
/// going.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FramingError {
    /// A header block that carries no `Content-Length` line at all.
    MissingContentLength,
    /// A `Content-Length` line whose value is not a decimal byte count.
    InvalidContentLength(String),
    /// The header block itself exceeded [`MAX_HEADER_BYTES`].
    OversizedHeader { header_bytes: usize },
    /// `Content-Length` parsed fine but exceeded [`MAX_FRAME_BYTES`].
    OversizedFrame { length: usize },
}

impl fmt::Display for FramingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FramingError::MissingContentLength => write!(f, "header block has no Content-Length"),
            FramingError::InvalidContentLength(value) => {
                write!(f, "invalid Content-Length value: {value:?}")
            }
            FramingError::OversizedHeader { header_bytes } => {
                write!(f, "header block of {header_bytes} bytes exceeds the {MAX_HEADER_BYTES} byte cap")
            }
            FramingError::OversizedFrame { length } => {
                write!(f, "frame of {length} bytes exceeds the {MAX_FRAME_BYTES} byte cap")
            }
        }
    }
}

/// Incremental parser: feed it raw stdout bytes, take complete message bodies.
///
/// Stateless between calls except for the internal buffer, so a single instance
/// can be driven from one reader loop for the lifetime of a server.
#[derive(Debug, Default)]
pub struct FrameReader {
    buf: Vec<u8>,
}

impl FrameReader {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append however many bytes the last `read()` produced.
    pub fn push(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
    }

    /// Bytes currently buffered (incomplete frame + any resync backlog).
    pub fn buffered(&self) -> usize {
        self.buf.len()
    }

    /// Next complete message body, or `None` while more bytes are needed.
    ///
    /// Yields `Err` for a malformed header block — the offending block has
    /// already been discarded, so the next call resumes scanning the stream.
    pub fn next(&mut self) -> Option<Result<Vec<u8>, FramingError>> {
        let Some((header_end, separator_len)) = find_header_terminator(&self.buf) else {
            // No terminator yet. Either we are mid-header, or the peer is
            // streaming bytes that will never become a header.
            if self.buf.len() > MAX_HEADER_BYTES {
                let header_bytes = self.buf.len();
                self.buf.clear();
                return Some(Err(FramingError::OversizedHeader { header_bytes }));
            }
            return None;
        };

        if header_end > MAX_HEADER_BYTES {
            let header_bytes = header_end;
            self.buf.clear();
            return Some(Err(FramingError::OversizedHeader { header_bytes }));
        }

        let body_start = header_end + separator_len;
        let length = match parse_content_length(&self.buf[..header_end]) {
            Ok(Some(length)) => length,
            Ok(None) => {
                // Drop the header block so scanning resumes at the next frame.
                self.buf.drain(..body_start);
                return Some(Err(FramingError::MissingContentLength));
            }
            Err(err) => {
                self.buf.drain(..body_start);
                return Some(Err(err));
            }
        };

        if length > MAX_FRAME_BYTES {
            // The declared length is not trustworthy, so the body cannot be
            // skipped precisely either: drop the header and resync.
            self.buf.drain(..body_start);
            return Some(Err(FramingError::OversizedFrame { length }));
        }

        if self.buf.len() < body_start + length {
            return None; // body still arriving
        }

        let payload = self.buf[body_start..body_start + length].to_vec();
        self.buf.drain(..body_start + length);
        Some(Ok(payload))
    }
}

/// Drain every complete frame currently buffered (errors included).
pub fn drain(reader: &mut FrameReader) -> Vec<Result<Vec<u8>, FramingError>> {
    let mut out = Vec::new();
    while let Some(frame) = reader.next() {
        out.push(frame);
    }
    out
}

/// Prefix a serialized JSON-RPC message with its `Content-Length` header.
///
/// `message.len()` is a byte count in Rust, which is what the spec requires
/// (the body is UTF-8 JSON).
pub fn encode_frame(message: &str) -> String {
    format!("Content-Length: {}\r\n\r\n{}", message.len(), message)
}

/// Locate the earliest header terminator, returning `(offset, separator_len)`.
///
/// CRLF (`\r\n\r\n`) is the spec-mandated form; LF (`\n\n`) is accepted because
/// several servers emit it when their writer is not strictly spec-compliant.
/// `\n\n` cannot occur *inside* `\r\n\r\n`, so taking the earliest match of
/// either is unambiguous.
fn find_header_terminator(buf: &[u8]) -> Option<(usize, usize)> {
    let crlf = find_subslice(buf, b"\r\n\r\n");
    let lf = find_subslice(buf, b"\n\n");
    match (crlf, lf) {
        (Some(a), Some(b)) if a <= b => Some((a, 4)),
        (Some(_), Some(b)) => Some((b, 2)),
        (Some(a), None) => Some((a, 4)),
        (None, Some(b)) => Some((b, 2)),
        (None, None) => None,
    }
}

/// Naive sub-slice search — the needles are 2–4 bytes, so `windows` is ideal.
fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Parse a header block for `Content-Length`.
///
/// Lines are scanned individually so leading junk (a stray log line a server
/// wrote to stdout by mistake) does not invalidate a otherwise-good frame.
fn parse_content_length(header: &[u8]) -> Result<Option<usize>, FramingError> {
    let text = String::from_utf8_lossy(header);

    for line in text.split('\n') {
        let line = line.trim_end_matches('\r');
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if !name.trim().eq_ignore_ascii_case("content-length") {
            continue;
        }
        let value = value.trim();
        return match value.parse::<usize>() {
            Ok(length) => Ok(Some(length)),
            Err(_) => Err(FramingError::InvalidContentLength(value.to_string())),
        };
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(message: &str) -> Vec<u8> {
        encode_frame(message).into_bytes()
    }

    fn collect(reader: &mut FrameReader) -> Vec<Result<Vec<u8>, FramingError>> {
        drain(reader)
    }

    // ── split reads ────────────────────────────────────────────────────────

    #[test]
    fn frame_split_across_reads_is_reassembled() {
        let message = r#"{"jsonrpc":"2.0","id":1}"#;
        let bytes = frame(message);
        let mut reader = FrameReader::new();

        // Split inside the header.
        reader.push(&bytes[..8]);
        assert_eq!(reader.next(), None, "header is incomplete");

        // Split inside the body.
        reader.push(&bytes[8..bytes.len() - 5]);
        assert_eq!(reader.next(), None, "body is incomplete");

        reader.push(&bytes[bytes.len() - 5..]);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), message.as_bytes());
        assert_eq!(reader.buffered(), 0);
    }

    #[test]
    fn frame_split_one_byte_at_a_time() {
        let bytes = frame(r#"{"jsonrpc":"2.0","method":"initialized"}"#);
        let mut reader = FrameReader::new();
        for byte in &bytes[..bytes.len() - 1] {
            reader.push(&[*byte]);
            assert_eq!(reader.next(), None);
        }
        reader.push(&[bytes[bytes.len() - 1]]);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(
            frames[0].as_ref().unwrap(),
            br#"{"jsonrpc":"2.0","method":"initialized"}"#
        );
    }

    // ── multiple frames per read ───────────────────────────────────────────

    #[test]
    fn multiple_frames_in_one_read_come_out_in_order() {
        let mut buffer = Vec::new();
        buffer.extend_from_slice(&frame(r#"{"id":1,"result":{}}"#));
        buffer.extend_from_slice(&frame(r#"{"id":2,"result":{}}"#));
        buffer.extend_from_slice(&frame(r#"{"method":"initialized"}"#));

        let mut reader = FrameReader::new();
        reader.push(&buffer);
        let frames = collect(&mut reader);

        assert_eq!(frames.len(), 3);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"id":1,"result":{}}"#);
        assert_eq!(frames[1].as_ref().unwrap(), br#"{"id":2,"result":{}}"#);
        assert_eq!(frames[2].as_ref().unwrap(), br#"{"method":"initialized"}"#);
        assert_eq!(reader.buffered(), 0);
    }

    #[test]
    fn trailing_partial_frame_survives_a_multi_frame_read() {
        let complete = frame(r#"{"id":1}"#);
        let partial = frame(r#"{"id":2}"#);
        let mut buffer = complete.clone();
        buffer.extend_from_slice(&partial[..partial.len() - 3]);

        let mut reader = FrameReader::new();
        reader.push(&buffer);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"id":1}"#);

        reader.push(&partial[partial.len() - 3..]);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"id":2}"#);
    }

    // ── missing header ─────────────────────────────────────────────────────

    #[test]
    fn header_block_without_content_length_is_reported_and_stream_recovers() {
        let mut reader = FrameReader::new();
        // A header block terminated correctly but carrying only Content-Type.
        reader.push(b"Content-Type: application/vscode-jsonrpc\r\n\r\n");
        assert_eq!(
            reader.next(),
            Some(Err(FramingError::MissingContentLength))
        );
        // The malformed block was consumed, so the next frame parses cleanly.
        reader.push(&frame(r#"{"id":7,"result":null}"#));
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"id":7,"result":null}"#);
    }

    #[test]
    fn non_frame_bytes_yield_missing_header_then_resync() {
        let mut reader = FrameReader::new();
        reader.push(b"this is not a frame at all\n\n");
        assert_eq!(
            reader.next(),
            Some(Err(FramingError::MissingContentLength))
        );
        reader.push(&frame(r#"{"ok":true}"#));
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"ok":true}"#);
    }

    #[test]
    fn garbage_prefix_line_is_skipped_when_content_length_is_present() {
        // A server that printed a log line to stdout before the real frame.
        let mut buffer = b"starting language server\n".to_vec();
        buffer.extend_from_slice(&frame(r#"{"id":3}"#));
        let mut reader = FrameReader::new();
        reader.push(&buffer);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), br#"{"id":3}"#);
    }

    // ── oversized header ───────────────────────────────────────────────────

    #[test]
    fn header_block_over_the_cap_is_rejected() {
        let mut reader = FrameReader::new();
        let mut header = Vec::new();
        // ~16 bytes per line; 4000 lines ≈ 64 KiB ≫ 8 KiB cap.
        for i in 0..4000 {
            header.extend_from_slice(format!("X-Junk-{i}: value\r\n").as_bytes());
        }
        header.extend_from_slice(b"\r\n");
        reader.push(&header);

        assert!(matches!(
            reader.next(),
            Some(Err(FramingError::OversizedHeader { header_bytes }))
                if header_bytes > MAX_HEADER_BYTES
        ));
        // Buffer was dropped rather than retained.
        assert_eq!(reader.buffered(), 0);
    }

    #[test]
    fn unterminated_header_growth_is_rejected() {
        let mut reader = FrameReader::new();

        // Exactly at the cap, with no terminator: still just "waiting".
        reader.push(&vec![b'a'; MAX_HEADER_BYTES]);
        assert_eq!(reader.next(), None);

        // One byte past the cap: rejected, and the buffer is emptied.
        reader.push(b"b");
        assert_eq!(
            reader.next(),
            Some(Err(FramingError::OversizedHeader {
                header_bytes: MAX_HEADER_BYTES + 1
            }))
        );
        assert_eq!(reader.buffered(), 0);
    }

    #[test]
    fn content_length_over_the_frame_cap_is_rejected_without_allocating() {
        let mut reader = FrameReader::new();
        reader.push(b"Content-Length: 999999999\r\n\r\n");
        assert_eq!(
            reader.next(),
            Some(Err(FramingError::OversizedFrame {
                length: 999_999_999
            }))
        );
        assert_eq!(reader.buffered(), 0);
        // Stream still usable afterwards.
        reader.push(&frame(r#"{"id":1}"#));
        assert_eq!(collect(&mut reader).len(), 1);
    }

    #[test]
    fn non_numeric_content_length_is_invalid_not_missing() {
        let mut reader = FrameReader::new();
        reader.push(b"Content-Length: soon\r\n\r\n{}");
        assert_eq!(
            reader.next(),
            Some(Err(FramingError::InvalidContentLength(
                "soon".to_string()
            )))
        );
    }

    // ── optional / alternate headers ───────────────────────────────────────

    #[test]
    fn optional_content_type_header_is_honoured() {
        let body = br#"{"id":null}"#; // 11 bytes
        let mut buffer = b"Content-Length: 11\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n".to_vec();
        buffer.extend_from_slice(body);
        let mut reader = FrameReader::new();
        reader.push(&buffer);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), body);
    }

    #[test]
    fn lf_only_terminator_is_accepted() {
        let body = r#"{"id":9}"#;
        let mut bytes = format!("Content-Length: {}\n\n", body.len()).into_bytes();
        bytes.extend_from_slice(body.as_bytes());
        let mut reader = FrameReader::new();
        reader.push(&bytes);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), body.as_bytes());
    }

    #[test]
    fn content_length_header_name_is_case_insensitive() {
        let body = r#"{"id":4}"#;
        let mut bytes = format!("content-length: {}\r\n\r\n", body.len()).into_bytes();
        bytes.extend_from_slice(body.as_bytes());
        let mut reader = FrameReader::new();
        reader.push(&bytes);
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), body.as_bytes());
    }

    // ── write side ─────────────────────────────────────────────────────────

    #[test]
    fn encode_frame_prefixes_content_length_in_bytes() {
        let message = r#"{"method":"initialized"}"#;
        let encoded = encode_frame(message);
        let expected_header = format!("Content-Length: {}\r\n\r\n", message.len());
        assert!(encoded.starts_with(&expected_header));
        assert_eq!(&encoded[expected_header.len()..], message);
    }

    #[test]
    fn encode_frame_counts_multibyte_characters_as_bytes() {
        let message = r#"{"result":"héllo ✓"}"#;
        let encoded = encode_frame(message);
        let declared = encoded
            .split_once("\r\n\r\n")
            .expect("frame has a header terminator")
            .0
            .split(':')
            .nth(1)
            .unwrap()
            .trim()
            .parse::<usize>()
            .unwrap();
        assert_eq!(declared, message.len(), "Content-Length must be bytes");
        assert_eq!(declared, message.as_bytes().len());
    }

    #[test]
    fn encode_then_parse_round_trips() {
        let message = r#"{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}"#;
        let mut reader = FrameReader::new();
        reader.push(encode_frame(message).as_bytes());
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].as_ref().unwrap(), message.as_bytes());
    }

    #[test]
    fn empty_message_round_trips() {
        let mut reader = FrameReader::new();
        reader.push(encode_frame("").as_bytes());
        let frames = collect(&mut reader);
        assert_eq!(frames.len(), 1);
        assert!(frames[0].as_ref().unwrap().is_empty());
    }
}
