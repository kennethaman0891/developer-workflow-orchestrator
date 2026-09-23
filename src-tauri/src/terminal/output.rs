//! Output Buffer
//!
//! Manages the output stream from PTY sessions, including scrollback
//! buffering and formatting for frontend consumption.

use std::sync::Arc;
use parking_lot::Mutex;
use tokio::sync::mpsc;

/// Manages terminal output with scrollback support
pub struct OutputBuffer {
    /// The output channel sender
    pub tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Scrollback buffer (capped at capacity)
    pub scrollback: Arc<Mutex<Vec<String>>>,
    /// Maximum scrollback lines
    pub capacity: usize,
}

impl OutputBuffer {
    /// Create a new output buffer
    pub fn new(capacity: usize) -> (Self, mpsc::UnboundedReceiver<Vec<u8>>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                tx,
                scrollback: Arc::new(Mutex::new(Vec::with_capacity(capacity))),
                capacity,
            },
            rx,
        )
    }

    /// Process raw output bytes and add to scrollback
    pub fn process_output(&self, data: &[u8]) {
        // Parse lines from the output
        let text = match std::str::from_utf8(data) {
            Ok(s) => s.to_string(),
            Err(_) => return, // Skip invalid UTF-8
        };

        // Split into lines and add to scrollback
        let lines: Vec<String> = text.lines().map(|l| l.to_string()).collect();
        let mut sb = self.scrollback.lock();

        for line in lines {
            sb.push(line);
            if sb.len() > self.capacity {
                sb.remove(0);
            }
        }
    }

    /// Send data to the frontend
    pub fn send(&self, data: Vec<u8>) -> Result<(), String> {
        self.tx.send(data).map_err(|e| e.to_string())
    }

    /// Get the current scrollback
    pub fn get_scrollback(&self) -> Vec<String> {
        self.scrollback.lock().clone()
    }
}
