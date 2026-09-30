//! Process environment hardening for GUI launches.
//!
//! When DWO starts from Finder/Dock/Spotlight it inherits launchd's minimal
//! environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, no Homebrew, no cargo,
//! no npm globals). Developer shells get the full PATH from rc files, but
//! `tokio::process::Command` children (git, language servers) and even PTY
//! login shells can miss user-local binary dirs. This module prepends the
//! standard user binary locations (deduped, only when they exist) once at
//! startup so every child process — git, rust-analyzer, pyright, node shims —
//! resolves the same way it does in the user's terminal.

use std::path::PathBuf;

/// Candidate binary directories, in priority order.
fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/local/sbin"),
        PathBuf::from("/opt/local/bin"),
        PathBuf::from("/opt/local/sbin"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".cargo/bin"));
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join("go/bin"));
        // fnm / nvm / volta / asdf shims
        dirs.push(home.join(".fnm"));
        dirs.push(home.join(".nvm/versions/node"));
        dirs.push(home.join(".volta/bin"));
        dirs.push(home.join(".asdf/shims"));
    }
    // /etc/paths.d entries (e.g. Xcode, MacPorts installers drop files here)
    if let Ok(entries) = std::fs::read_dir("/etc/paths.d") {
        for entry in entries.flatten() {
            if let Ok(content) = std::fs::read_to_string(entry.path()) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && !trimmed.starts_with('#') {
                        dirs.push(PathBuf::from(trimmed));
                    }
                }
            }
        }
    }
    dirs
}

/// Prepend existing user binary dirs to this process's PATH (idempotent).
pub fn harden_process_path() {
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut parts: Vec<PathBuf> = std::env::split_paths(&current).collect();

    let mut prepend: Vec<PathBuf> = Vec::new();
    for dir in candidate_dirs() {
        if dir.is_dir() && !parts.iter().any(|p| p == &dir) && !prepend.iter().any(|p| p == &dir) {
            prepend.push(dir);
        }
    }
    if prepend.is_empty() {
        return;
    }
    prepend.append(&mut parts);
    if let Ok(joined) = std::env::join_paths(prepend) {
        std::env::set_var("PATH", joined);
    }
}
