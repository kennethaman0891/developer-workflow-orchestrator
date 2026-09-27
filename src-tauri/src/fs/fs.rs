//! File System Module (Phase 2)
//!
//! Provides file and directory operations with path containment.

use std::collections::HashSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use walkdir::WalkDir;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::fs::ignore::{self, IgnoreRules};

/// A file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mtime: Option<String>,
}

/// List directory contents
pub fn list_dir(path: &str) -> Result<Vec<FsEntry>, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let mut entries = Vec::new();

    for entry in path.read_dir().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if file_name.starts_with('.') {
            continue;
        }

        let full_path = entry.path().to_string_lossy().to_string();

        entries.push(FsEntry {
            name: file_name,
            path: full_path,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
            mtime: metadata.modified().ok().and_then(|t| {
                use std::convert::TryInto;
                let dt: chrono::DateTime<chrono::Utc> = t.try_into().ok()?;
                Some(dt.to_rfc3339())
            }),
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return if a.is_dir { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
        }
        a.name.cmp(&b.name)
    });

    Ok(entries)
}

/// Read file contents
pub fn read_file(path: &str) -> Result<String, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }

    if path.is_dir() {
        return Err("Path is a directory, not a file".to_string());
    }

    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Write file contents
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Create a new file
pub fn create_file(path: &str) -> Result<(), String> {
    let path = Path::new(path);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Only create if doesn't exist
    if !path.exists() {
        std::fs::File::create(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Create a directory
pub fn create_dir(path: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Rename/move a file or directory
pub fn rename(old_path: &str, new_path: &str) -> Result<(), String> {
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// Delete a file or directory
pub fn delete(path: &str) -> Result<(), String> {
    let path = Path::new(path);

    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Content search
// ---------------------------------------------------------------------------

/// Hard cap on the number of matches returned by [`search_content`].
pub const SEARCH_MAX_RESULTS: usize = 500;
/// Total wall-clock budget for a single content-search walk.
pub const SEARCH_TIME_BUDGET: Duration = Duration::from_millis(2_000);
/// Files larger than this many bytes are skipped without being read.
pub const SEARCH_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
/// Maximum directory depth below the walk root (root children are depth 1).
pub const SEARCH_MAX_DEPTH: usize = 32;
/// Number of leading bytes sniffed for a NUL byte to classify a file as
/// binary.
const SEARCH_SNIFF_LEN: usize = 8192;
/// Patterns longer than this are matched literally instead of compiled, so
/// pathological input can never stall the regex compiler.
const SEARCH_REGEX_MAX_LEN: usize = 512;

/// One content match inside a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResult {
    /// Path of the matched file, exactly as walked.
    pub path: String,
    /// 1-based line number of the match.
    pub line_number: u64,
    /// The whole line containing the match, trailing newline stripped.
    pub line_text: String,
    /// Byte offset of the start of that line within the file.
    pub byte_offset: u64,
}

/// Result of a bounded content search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    /// Matches in walk order, capped at [`SEARCH_MAX_RESULTS`].
    pub results: Vec<SearchResult>,
    /// True when the result cap or the time budget cut the walk short.
    pub truncated: bool,
}

/// How a search pattern is applied to a single line of text.
enum Matcher {
    /// Plain substring search. `folded` is `needle` lowercased, used only when
    /// `case_sensitive` is false.
    Literal {
        needle: String,
        folded: String,
        case_sensitive: bool,
    },
    /// Compiled regular expression.
    Regex(Regex),
}

impl Matcher {
    /// Does `line` contain this pattern?
    fn is_match(&self, line: &str) -> bool {
        match self {
            Matcher::Literal {
                needle,
                folded,
                case_sensitive,
            } => {
                if *case_sensitive {
                    line.contains(needle.as_str())
                } else {
                    line.to_lowercase().contains(folded.as_str())
                }
            }
            Matcher::Regex(regex) => regex.is_match(line),
        }
    }
}

/// Build the matcher for `pattern`.
///
/// A pattern is treated as a regex only when it compiles **and** fits in
/// [`SEARCH_REGEX_MAX_LEN`] bytes; anything else (invalid regex such as
/// `foo(`, or an over-long pattern) silently falls back to literal substring
/// matching, so bad user input can never fail the command. `case_sensitive`
/// defaults to `true`; when false, a `(?i)` flag is applied to the regex and
/// literal matching case-folds both sides.
fn build_matcher(pattern: &str, case_sensitive: bool) -> Matcher {
    if pattern.len() <= SEARCH_REGEX_MAX_LEN {
        if let Ok(regex) = Regex::new(pattern) {
            if case_sensitive {
                return Matcher::Regex(regex);
            }
            // The pattern already compiled, so prefixing a flag group keeps
            // it valid; if it somehow does not, fall through to literal.
            if let Ok(regex) = Regex::new(&format!("(?i){}", pattern)) {
                return Matcher::Regex(regex);
            }
        }
    }

    Matcher::Literal {
        needle: pattern.to_string(),
        folded: pattern.to_lowercase(),
        case_sensitive,
    }
}

/// Bounded, ripgrep-style content search.
///
/// Walks `base` (default: current directory) and reports every line that
/// contains `pattern`. Guarantees:
///
/// * never returns more than [`SEARCH_MAX_RESULTS`] matches and stops the
///   walk once [`SEARCH_TIME_BUDGET`] elapses — [`SearchResponse::truncated`]
///   reports whether a bound ended the search early,
/// * never follows symlinks, never descends into [`ignore::DEFAULT_IGNORED`]
///   names (`node_modules`, `target`, `dist`, …) or `.gitignore`d paths,
/// * skips binary files (NUL byte in the first [`SEARCH_SNIFF_LEN`] bytes),
///   files larger than [`SEARCH_MAX_FILE_BYTES`] and non-UTF-8 files,
/// * matches literally by default; a pattern is compiled as a regex only
///   when it is valid and at most [`SEARCH_REGEX_MAX_LEN`] bytes long.
///
/// `case_sensitive` defaults to `true`. `glob`, when set, restricts results
/// to file names matching that glob (e.g. `*.rs`).
///
/// Blocking filesystem work — callers on the async runtime should wrap this
/// in `tokio::task::spawn_blocking`.
pub fn search_content(
    pattern: &str,
    base: Option<&str>,
    case_sensitive: Option<bool>,
    glob: Option<&str>,
) -> Result<SearchResponse, String> {
    search_content_bounded(
        pattern,
        base,
        case_sensitive,
        glob,
        SEARCH_MAX_RESULTS,
        SEARCH_TIME_BUDGET,
    )
}

/// [`search_content`] with the result cap and time budget injected so tests
/// can exercise the bounds without generating hundreds of files.
fn search_content_bounded(
    pattern: &str,
    base: Option<&str>,
    case_sensitive: Option<bool>,
    glob: Option<&str>,
    max_results: usize,
    budget: Duration,
) -> Result<SearchResponse, String> {
    let base = base.unwrap_or(".");
    let root = Path::new(base);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", base));
    }

    // An empty pattern would match every line of every file: never useful and
    // it would burn the whole time budget, so short-circuit instead.
    if pattern.is_empty() {
        return Ok(SearchResponse {
            results: Vec::new(),
            truncated: false,
        });
    }

    let matcher = build_matcher(pattern, case_sensitive.unwrap_or(true));
    let name_filter = glob.map(ignore::parse_glob);
    let rules = ignore::IgnoreRules::load(root);
    let started = Instant::now();

    let mut results: Vec<SearchResult> = Vec::new();
    let mut truncated = false;

    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(SEARCH_MAX_DEPTH)
        .into_iter()
        // Shared ignore rules: default names + the walked root's .gitignore.
        // The root itself is never checked, so searching from inside a
        // directory that happens to be called `dist` still works.
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if ignore::is_name_ignored(&entry.file_name().to_string_lossy()) {
                return false;
            }
            let is_dir = entry.file_type().is_dir();
            let rel = entry.path().strip_prefix(root).unwrap_or(entry.path());
            !rules.entry_ignored(rel, is_dir)
        });

    for entry in walker.filter_map(|entry| entry.ok()) {
        if started.elapsed() >= budget {
            truncated = true;
            break;
        }
        if results.len() >= max_results {
            truncated = true;
            break;
        }
        if entry.depth() == 0 {
            continue;
        }

        // Never follow symlinks; only regular files are searched.
        let file_type = entry.file_type();
        if file_type.is_symlink() || !file_type.is_file() {
            continue;
        }

        if let Some(tokens) = &name_filter {
            if !ignore::glob_matches(tokens, &entry.file_name().to_string_lossy()) {
                continue;
            }
        }

        let text = match read_text_file(entry.path()) {
            Some(text) => text,
            None => continue,
        };

        let remaining = max_results - results.len();
        let overflowed = collect_matches(
            &entry.path().to_string_lossy(),
            &text,
            &matcher,
            remaining,
            &mut results,
        );
        if overflowed {
            truncated = true;
            break;
        }
    }

    Ok(SearchResponse {
        results,
        truncated,
    })
}

/// Read `path` as UTF-8 text, applying the search skip rules.
///
/// Returns `None` (file skipped) when it is larger than
/// [`SEARCH_MAX_FILE_BYTES`], sniffs as binary (NUL byte within the first
/// [`SEARCH_SNIFF_LEN`] bytes) or is not valid UTF-8. Reading stops at the
/// size cap even if the file grew after the metadata check.
fn read_text_file(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if metadata.len() > SEARCH_MAX_FILE_BYTES {
        return None;
    }

    let mut file = std::fs::File::open(path).ok()?;

    // Sniff the leading bytes first so huge binaries are rejected cheaply.
    let mut bytes: Vec<u8> = Vec::with_capacity(metadata.len() as usize);
    (&mut file)
        .take(SEARCH_SNIFF_LEN as u64)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.contains(&0) {
        return None;
    }

    file.read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > SEARCH_MAX_FILE_BYTES {
        return None;
    }

    String::from_utf8(bytes).ok()
}

/// Scan `text` line by line, pushing matches into `out` until it holds
/// `remaining` results. Returns `true` when another match was found after
/// that cap was reached — i.e. results were left on the table.
fn collect_matches(
    path: &str,
    text: &str,
    matcher: &Matcher,
    remaining: usize,
    out: &mut Vec<SearchResult>,
) -> bool {
    let mut line_number: u64 = 0;
    let mut byte_offset: u64 = 0;

    for segment in text.split_inclusive('\n') {
        line_number += 1;

        let line = segment.strip_suffix('\n').unwrap_or(segment);
        let line = line.strip_suffix('\r').unwrap_or(line);

        if matcher.is_match(line) {
            if out.len() >= remaining {
                return true;
            }
            out.push(SearchResult {
                path: path.to_string(),
                line_number,
                line_text: line.to_string(),
                byte_offset,
            });
        }

        byte_offset += segment.len() as u64;
    }

    false
}

/// Content search in the legacy `Vec<String>` shape.
///
/// Compatibility wrapper around [`search_content`]: runs the bounded content
/// search with default options and returns the de-duplicated paths of the
/// matching files, in walk order. Use [`search_content`] (exposed to the
/// frontend as the `search_files` command) for structured results carrying
/// line numbers and the `truncated` flag.
pub fn search(pattern: &str, base_path: Option<&str>) -> Result<Vec<String>, String> {
    let response = search_content(pattern, base_path, None, None)?;
    let mut seen = HashSet::new();
    Ok(response
        .results
        .into_iter()
        .map(|result| result.path)
        .filter(|path| seen.insert(path.clone()))
        .collect())
}

// ---------------------------------------------------------------------------
// Recursive tree listing
// ---------------------------------------------------------------------------

/// Default maximum depth for [`list_tree`] (root children are depth 1).
pub const DEFAULT_MAX_DEPTH: usize = 12;
/// Default maximum number of entries returned by [`list_tree`].
pub const DEFAULT_MAX_ENTRIES: usize = 20_000;

/// Result of a recursive tree listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeListing {
    /// The directory the walk started from.
    pub root: String,
    /// True when the depth or entry cap cut the listing short.
    pub truncated: bool,
    /// Top-level entries (directories carry their own `children`).
    pub entries: Vec<TreeNode>,
}

/// An [`FsEntry`] plus, for directories, its children.
///
/// Flattened on the wire, so a `TreeNode` serializes as a plain `FsEntry`
/// with an optional `children` array appended.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    #[serde(flatten)]
    pub entry: FsEntry,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
}

/// Mutable state shared across the walk.
struct WalkState {
    rules: IgnoreRules,
    max_depth: usize,
    max_entries: usize,
    /// Number of entries emitted so far.
    count: usize,
    truncated: bool,
}

/// A visible directory entry collected from one directory read.
type Collected = (bool, String, PathBuf, std::fs::Metadata);

/// Recursively list a directory tree.
///
/// * never follows symlinks (symlinked directories are skipped entirely),
/// * skips [`ignore::DEFAULT_IGNORED`] names and `.gitignore` matches,
/// * sorts children directories-first, then case-insensitively by name,
/// * stops at `max_depth` levels / `max_entries` entries, setting
///   [`TreeListing::truncated`] when either cap is hit.
///
/// Blocking filesystem work — callers on the async runtime should wrap this
/// in `tokio::task::spawn_blocking`.
pub fn list_tree(path: &str, max_depth: usize, max_entries: usize) -> Result<TreeListing, String> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut state = WalkState {
        rules: IgnoreRules::load(root),
        max_depth: max_depth.max(1),
        max_entries: max_entries.max(1),
        count: 0,
        truncated: false,
    };

    let entries = walk_dir(root, 1, &mut state);

    Ok(TreeListing {
        root: path.to_string(),
        truncated: state.truncated,
        entries,
    })
}

/// Read `dir` and return its visible entries (ignore rules applied,
/// symlinks-to-directories dropped, metadata attached).
fn collect_visible(dir: &Path, state: &WalkState) -> Vec<Collected> {
    let mut collected = Vec::new();

    let read_dir = match dir.read_dir() {
        Ok(read_dir) => read_dir,
        Err(_) => return collected,
    };

    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if ignore::is_name_ignored(&name) {
            continue;
        }

        let path = entry.path();
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        // Never follow symlinks. A symlink is resolved once just to learn
        // what it points at: symlinked directories are skipped (no recursion,
        // no cycles), symlinked files are listed as plain files.
        let metadata = if metadata.is_symlink() {
            match std::fs::metadata(&path) {
                Ok(target) if target.is_dir() => continue,
                Ok(target) if target.is_file() => target,
                _ => continue,
            }
        } else {
            metadata
        };

        let is_dir = metadata.is_dir();
        let rel = path.strip_prefix(state.rules.root()).unwrap_or(&path);
        if state.rules.entry_ignored(rel, is_dir) {
            continue;
        }

        collected.push((is_dir, name, path, metadata));
    }

    collected
}

/// Sort directories first, then case-insensitively by name (case-sensitive
/// tie-break so ordering stays stable).
fn sort_collected(collected: &mut [Collected]) {
    collected.sort_by(|a, b| {
        let dir_order = b.0.cmp(&a.0);
        let case_insensitive = a.1.to_lowercase().cmp(&b.1.to_lowercase());
        dir_order.then_with(|| case_insensitive).then_with(|| a.1.cmp(&b.1))
    });
}

/// Walk one directory level. `depth` is the depth of the entries inside it
/// (root children are depth 1).
fn walk_dir(dir: &Path, depth: usize, state: &mut WalkState) -> Vec<TreeNode> {
    let mut collected = collect_visible(dir, state);
    sort_collected(&mut collected);

    let mut nodes = Vec::new();

    for (is_dir, name, path, metadata) in collected {
        if state.count >= state.max_entries {
            state.truncated = true;
            break;
        }
        state.count += 1;

        let entry = FsEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size: if is_dir { None } else { Some(metadata.len()) },
            mtime: metadata.modified().ok().and_then(|t| {
                use std::convert::TryInto;
                let dt: chrono::DateTime<chrono::Utc> = t.try_into().ok()?;
                Some(dt.to_rfc3339())
            }),
        };

        let children = if is_dir {
            if depth < state.max_depth {
                Some(walk_dir(&path, depth + 1, state))
            } else {
                // Depth cap: don't descend, but report it if there was more.
                if !collect_visible(&path, state).is_empty() {
                    state.truncated = true;
                }
                Some(Vec::new())
            }
        } else {
            None
        };

        nodes.push(TreeNode { entry, children });
    }

    nodes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, "x").unwrap();
    }

    fn names(entries: &[TreeNode]) -> Vec<&str> {
        entries.iter().map(|e| e.entry.name.as_str()).collect()
    }

    #[test]
    fn list_tree_applies_default_ignores_and_sorts_dirs_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("src/main.rs"));
        touch(&root.join("node_modules/pkg/index.js"));
        touch(&root.join("file.txt"));

        let listing =
            list_tree(root.to_str().unwrap(), DEFAULT_MAX_DEPTH, DEFAULT_MAX_ENTRIES).unwrap();

        assert!(!listing.truncated);
        // `node_modules` is skipped, directories sort before files.
        assert_eq!(names(&listing.entries), vec!["src", "file.txt"]);

        let src = &listing.entries[0];
        assert!(src.entry.is_dir);
        assert_eq!(names(src.children.as_ref().unwrap()), vec!["main.rs"]);
        assert!(listing.entries[1].children.is_none());
    }

    #[test]
    fn list_tree_reports_depth_truncation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("a/b/c/file.txt"));

        let listing = list_tree(root.to_str().unwrap(), 2, DEFAULT_MAX_ENTRIES).unwrap();

        assert!(listing.truncated);
        assert_eq!(names(&listing.entries), vec!["a"]);
        assert_eq!(names(listing.entries[0].children.as_ref().unwrap()), vec!["b"]);
    }

    #[test]
    fn list_tree_reports_entry_cap_truncation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for i in 0..5 {
            touch(&root.join(format!("file_{}.txt", i)));
        }

        let listing = list_tree(root.to_str().unwrap(), DEFAULT_MAX_DEPTH, 3).unwrap();

        assert!(listing.truncated);
        assert_eq!(listing.entries.len(), 3);
    }

    #[cfg(unix)]
    #[test]
    fn list_tree_never_follows_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("real/file.txt"));
        std::os::unix::fs::symlink(root.join("real"), root.join("link")).unwrap();

        let listing =
            list_tree(root.to_str().unwrap(), DEFAULT_MAX_DEPTH, DEFAULT_MAX_ENTRIES).unwrap();

        // The symlink points at a directory → skipped entirely (no cycles).
        assert_eq!(names(&listing.entries), vec!["real"]);
    }

    // -----------------------------------------------------------------------
    // Content search
    // -----------------------------------------------------------------------

    fn write(path: impl AsRef<Path>, contents: impl AsRef<[u8]>) {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, contents).unwrap();
    }

    #[test]
    fn content_search_reports_line_numbers_and_offsets() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "one\ntwo needle\nneedle again\n");

        let response =
            search_content("needle", Some(dir.path().to_str().unwrap()), None, None).unwrap();

        assert!(!response.truncated);
        assert_eq!(response.results.len(), 2);

        let first = &response.results[0];
        assert!(first.path.ends_with("a.txt"));
        assert_eq!(first.line_number, 2);
        assert_eq!(first.line_text, "two needle");
        assert_eq!(first.byte_offset, 4); // len("one\n")

        let second = &response.results[1];
        assert_eq!(second.line_number, 3);
        assert_eq!(second.line_text, "needle again");
        assert_eq!(second.byte_offset, 15); // 4 + len("two needle\n")
    }

    #[test]
    fn content_search_is_case_sensitive_unless_asked_otherwise() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "Hello world\n");
        let root = dir.path().to_str().unwrap();

        let sensitive = search_content("hello", Some(root), None, None).unwrap();
        assert!(sensitive.results.is_empty());

        let folded = search_content("hello", Some(root), Some(false), None).unwrap();
        assert_eq!(folded.results.len(), 1);
        assert_eq!(folded.results[0].line_number, 1);

        let exact = search_content("Hello", Some(root), None, None).unwrap();
        assert_eq!(exact.results.len(), 1);
    }

    #[test]
    fn content_search_compiles_valid_patterns_as_regex() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "hello\n");
        let root = dir.path().to_str().unwrap();

        // The dot only matches because this pattern is compiled as a regex.
        let regex = search_content("h.llo", Some(root), None, None).unwrap();
        assert_eq!(regex.results.len(), 1);

        // Case-insensitive regex gets a (?i) prefix instead of erroring.
        let folded = search_content("HELLO", Some(root), Some(false), None).unwrap();
        assert_eq!(folded.results.len(), 1);
        let sensitive = search_content("HELLO", Some(root), None, None).unwrap();
        assert!(sensitive.results.is_empty());
    }

    #[test]
    fn content_search_falls_back_to_literal_when_regex_is_invalid() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "call foo( me\nfoo alone\n");
        let root = dir.path().to_str().unwrap();

        // Unclosed group: bad input must not fail the command.
        let literal = search_content("foo(", Some(root), None, None).unwrap();
        assert_eq!(literal.results.len(), 1);
        assert_eq!(literal.results[0].line_number, 1);

        // The literal fallback still honours `case_sensitive`.
        let folded = search_content("FOO(", Some(root), Some(false), None).unwrap();
        assert_eq!(folded.results.len(), 1);
        let sensitive = search_content("FOO(", Some(root), None, None).unwrap();
        assert!(sensitive.results.is_empty());
    }

    #[test]
    fn content_search_treats_over_long_patterns_as_literals() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        let short = "x.y".to_string(); // compiles → regex
        let long = format!("{}{}{}", "m".repeat(500), ".", "n".repeat(20));
        assert!(long.len() > SEARCH_REGEX_MAX_LEN);

        write(
            dir.path().join("a.txt"),
            format!(
                "xXy\n{}\n{}\n",
                long.replace('.', "X"), // only a regex would match this line
                long,                   // only a literal would match this line
            ),
        );

        let regex_match = search_content(&short, Some(root), None, None).unwrap();
        assert_eq!(regex_match.results.len(), 1);
        assert_eq!(regex_match.results[0].line_number, 1);

        let literal_match = search_content(&long, Some(root), None, None).unwrap();
        assert_eq!(literal_match.results.len(), 1);
        assert_eq!(literal_match.results[0].line_number, 3);
    }

    #[test]
    fn content_search_caps_results_and_flags_truncation() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("many.txt"), "needle\n".repeat(600));

        let response =
            search_content("needle", Some(dir.path().to_str().unwrap()), None, None).unwrap();

        assert_eq!(response.results.len(), SEARCH_MAX_RESULTS);
        assert!(response.truncated);
        assert_eq!(response.results[0].line_number, 1);
        assert_eq!(
            response.results[SEARCH_MAX_RESULTS - 1].line_number,
            SEARCH_MAX_RESULTS as u64
        );
    }

    #[test]
    fn content_search_respects_injected_result_cap() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "needle\n".repeat(10));

        let response = search_content_bounded(
            "needle",
            Some(dir.path().to_str().unwrap()),
            None,
            None,
            3,
            SEARCH_TIME_BUDGET,
        )
        .unwrap();

        assert_eq!(response.results.len(), 3);
        assert!(response.truncated);
    }

    #[test]
    fn content_search_stops_when_time_budget_is_exhausted() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "needle\n");

        let response = search_content_bounded(
            "needle",
            Some(dir.path().to_str().unwrap()),
            None,
            None,
            SEARCH_MAX_RESULTS,
            Duration::ZERO,
        )
        .unwrap();

        assert!(response.truncated);
        assert!(response.results.is_empty());
    }

    #[test]
    fn content_search_skips_binary_and_oversized_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        write(dir.path().join("binary.dat"), b"needle\x00tail".to_vec());
        let mut huge = vec![b'a'; SEARCH_MAX_FILE_BYTES as usize + 1];
        huge[..6].copy_from_slice(b"needle");
        write(dir.path().join("huge.txt"), huge);
        write(dir.path().join("ok.txt"), "needle here\n");

        let response = search_content("needle", Some(root), None, None).unwrap();

        assert_eq!(response.results.len(), 1);
        assert!(response.results[0].path.ends_with("ok.txt"));
    }

    #[test]
    fn content_search_skips_default_ignored_directories() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        write(dir.path().join("node_modules/pkg.js"), "needle\n");
        write(dir.path().join("target/debug.log"), "needle\n");
        write(dir.path().join("dist/bundle.js"), "needle\n");
        write(dir.path().join("src/main.rs"), "needle\n");

        let response = search_content("needle", Some(root), None, None).unwrap();

        assert_eq!(response.results.len(), 1);
        assert!(response.results[0].path.ends_with("src/main.rs"));
    }

    #[test]
    fn content_search_respects_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        write(dir.path().join(".gitignore"), "*.log\n");
        write(dir.path().join("debug.log"), "needle\n");
        write(dir.path().join("keep.txt"), "needle\n");

        let response = search_content("needle", Some(root), None, None).unwrap();

        assert_eq!(response.results.len(), 1);
        assert!(response.results[0].path.ends_with("keep.txt"));
    }

    #[test]
    fn content_search_filters_file_names_with_glob() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        write(dir.path().join("main.rs"), "needle\n");
        write(dir.path().join("notes.txt"), "needle\n");
        write(dir.path().join("src/lib.rs"), "needle\n");

        let response = search_content("needle", Some(root), None, Some("*.rs")).unwrap();

        assert_eq!(response.results.len(), 2);
        assert!(response.results.iter().all(|r| r.path.ends_with(".rs")));
    }

    #[cfg(unix)]
    #[test]
    fn content_search_never_follows_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        write(root.join("real.txt"), "needle\n");
        write(root.join("sub/nested.txt"), "needle\n");
        std::os::unix::fs::symlink(root.join("real.txt"), root.join("link.txt")).unwrap();
        std::os::unix::fs::symlink(root.join("sub"), root.join("linkdir")).unwrap();

        let response =
            search_content("needle", Some(root.to_str().unwrap()), None, None).unwrap();

        assert_eq!(response.results.len(), 2);
        assert!(response.results.iter().all(|r| !r.path.contains("link")));
    }

    #[test]
    fn content_search_empty_pattern_returns_nothing() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path().join("a.txt"), "anything\n");

        let response =
            search_content("", Some(dir.path().to_str().unwrap()), None, None).unwrap();

        assert!(response.results.is_empty());
        assert!(!response.truncated);
    }

    #[test]
    fn content_search_missing_path_errors() {
        let response = search_content("needle", Some("/definitely/not/a/real/path"), None, None);
        assert!(response.is_err());
    }

    #[test]
    fn legacy_search_returns_unique_paths_of_matching_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        write(dir.path().join("a.txt"), "needle\nneedle again\n");
        write(dir.path().join("b.txt"), "no match\n");
        write(dir.path().join("c.txt"), "needle\n");

        let paths = search("needle", Some(root)).unwrap();

        assert_eq!(paths.len(), 2);
        assert!(paths.iter().all(|path| !path.ends_with("b.txt")));
    }
}
