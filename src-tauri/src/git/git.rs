//! DWO Git Module
//!
//! Real git integration using tokio::process::Command.
//! Each method shells out to the `git` CLI against the provided repo_path.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

/// Git status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub modified: Vec<String>,
    pub staged: Vec<String>,
    pub untracked: Vec<String>,
}

/// Git command result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitResult {
    pub success: bool,
    pub message: String,
    pub output: Option<String>,
}

/// Git manager
pub struct GitManager {
    repo_path: PathBuf,
}

impl GitManager {
    /// Create a new GitManager
    pub fn new(repo_path: PathBuf) -> Self {
        Self { repo_path }
    }

    /// Set the repo path (called when workspace.projectPath changes)
    pub fn set_repo_path(&mut self, path: PathBuf) {
        self.repo_path = path;
    }

    /// Run a git command and return its stdout as a String
    async fn run_git(&self, args: &[&str]) -> Result<String, String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(&self.repo_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to run git: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git {} failed: {}", args.join(" "), stderr.trim()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Get current git status
    pub async fn status(&self) -> Result<GitStatus, String> {
        // Check if we're in a git repo
        if !self.repo_path.join(".git").exists() {
            return Ok(GitStatus {
                branch: String::new(),
                modified: vec![],
                staged: vec![],
                untracked: vec![],
            });
        }

        // Get branch name
        let branch = self.run_git(&["rev-parse", "--abbrev-ref", "HEAD"]).await
            .unwrap_or_else(|_| "main".to_string())
            .trim()
            .to_string();

        // Get status --porcelain=v1
        let porcelain = self.run_git(&["status", "--porcelain=v1"]).await
            .unwrap_or_default();

        let mut modified = Vec::new();
        let mut staged = Vec::new();
        let mut untracked = Vec::new();

        for line in porcelain.lines() {
            if line.len() < 3 {
                continue;
            }
            let index_status = line.as_bytes()[0] as char;
            let worktree_status = line.as_bytes()[1] as char;
            let path = line[3..].to_string();

            // Untracked
            if index_status == '?' && worktree_status == '?' {
                untracked.push(path);
                continue;
            }

            // Staged (index has changes)
            if index_status != ' ' && index_status != '?' {
                staged.push(path.clone());
            }

            // Modified (worktree has changes)
            if worktree_status != ' ' && worktree_status != '?' {
                modified.push(path);
            }
        }

        Ok(GitStatus {
            branch,
            modified,
            staged,
            untracked,
        })
    }

    /// Stage a file
    /// Stage a file (`git add`).
    ///
    /// The `--` separator before the path prevents a user-supplied filename
    /// starting with `-` from being parsed as a flag (a file literally named
    /// `--all` would otherwise stage the entire working tree).
    pub async fn stage(&self, file: &str) -> Result<GitResult, String> {
        self.run_git(&["add", "--", file]).await?;
        Ok(GitResult {
            success: true,
            message: format!("Staged {}", file),
            output: None,
        })
    }

    /// Unstage a file (`git restore --staged`, falling back to `git reset HEAD`).
    ///
    /// The `--` separator before the path prevents a user-supplied filename
    /// starting with `-` from being parsed as a flag.
    pub async fn unstage(&self, file: &str) -> Result<GitResult, String> {
        let primary = self.run_git(&["restore", "--staged", "--", file]).await;
        let output = match primary {
            Ok(out) => out,
            // `git restore` only exists since 2.23 — older installs fall back.
            Err(_) => self.run_git(&["reset", "HEAD", "--", file]).await?,
        };
        Ok(GitResult {
            success: true,
            message: format!("Unstaged {}", file),
            output: Some(output),
        })
    }

    /// Commit changes
    pub async fn commit(&self, message: &str) -> Result<GitResult, String> {
        let output = self.run_git(&["commit", "-m", message]).await?;
        Ok(GitResult {
            success: true,
            message: format!("Committed: {}", message),
            output: Some(output),
        })
    }

    /// Get git log
    pub async fn log(&self, limit: usize) -> Result<Vec<String>, String> {
        let output = self.run_git(&["log", &format!("-{}", limit), "--oneline"]).await?;
        Ok(output.lines().map(|l| l.to_string()).collect())
    }

    /// Get current branch
    pub async fn branch(&self) -> Result<String, String> {
        self.run_git(&["rev-parse", "--abbrev-ref", "HEAD"]).await
            .map(|s| s.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run a git command in `dir` and return its stdout.
    async fn git_in(dir: &std::path::Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .await
            .expect("failed to run git");
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    /// `stage()` must pass `--` before the path. A file literally named `--all`
    /// is legal on disk, and without the separator `git add --all` would run and
    /// stage the entire working tree instead of that one file.
    #[tokio::test]
    async fn stage_does_not_treat_a_dash_prefixed_filename_as_a_flag() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();

        git_in(root, &["init", "-q"]).await;
        std::fs::write(root.join("--all"), b"flag-like\n").expect("write --all");
        std::fs::write(root.join("bystander.txt"), b"untouched\n").expect("write bystander");

        let manager = GitManager::new(root.to_path_buf());
        manager.stage("--all").await.expect("stage --all");

        let staged: Vec<String> = git_in(root, &["diff", "--cached", "--name-only"])
            .await
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();

        assert_eq!(
            staged,
            vec!["--all".to_string()],
            "only the file named --all should be staged, not the whole tree"
        );
    }
}
