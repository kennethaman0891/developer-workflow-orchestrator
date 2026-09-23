//! Render Scheduler
//!
//! Manages async rendering of terminal output to prevent blocking
//! the main event loop.

use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

/// Schedule periodic output flushing
pub async fn schedule_render(
    mut rx: mpsc::Receiver<Vec<u8>>,
    flush_interval: Duration,
) {
    let mut interval = interval(flush_interval);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Flush any pending output
                while let Ok(data) = rx.try_recv() {
                    // In a real implementation, this would push to the UI queue
                    let _ = data;
                }
            }
            Some(data) = rx.recv() => {
                // Immediate send for high priority output
                let _ = data;
            }
            else => break,
        }
    }
}
