//! Shared ignore rules for filesystem walks.
//!
//! Dependency-free by design: a fixed deny-list of directory names plus a
//! hand-rolled `.gitignore` line matcher (negation with `!`, directory-only
//! patterns with a trailing `/`, and `*` / `**` wildcards). The walked root's
//! `.gitignore` is read once per root and cached, so per-entry checks stay
//! cheap.
//!
//! Consumers: `fs::fs::list_tree`, and later content search / file watching.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Names that are always ignored, regardless of any `.gitignore`.
pub const DEFAULT_IGNORED: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "out",
    ".next",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    "coverage",
];

/// Returns `true` when `name` is one of [`DEFAULT_IGNORED`].
pub fn is_name_ignored(name: &str) -> bool {
    DEFAULT_IGNORED.iter().any(|ignored| *ignored == name)
}

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/// A single token of a parsed glob pattern.
///
/// Built by [`parse_glob`] and evaluated by [`glob_matches`]; both are public
/// so content search can reuse the exact same glob semantics for its optional
/// filename filter instead of re-implementing them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Glob {
    /// A literal character.
    Literal(char),
    /// `?` — any single character except `/`.
    Any,
    /// `*` — any run of characters except `/`.
    Star,
    /// `**` — any run of characters, including `/`.
    DoubleStar,
}

/// Parse a glob body into tokens. `\x` escapes the next character.
pub fn parse_glob(body: &str) -> Vec<Glob> {
    let chars: Vec<char> = body.chars().collect();
    let mut out = Vec::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '\\' if i + 1 < chars.len() => {
                out.push(Glob::Literal(chars[i + 1]));
                i += 2;
            }
            '?' => {
                out.push(Glob::Any);
                i += 1;
            }
            '*' => {
                let start = i;
                while i < chars.len() && chars[i] == '*' {
                    i += 1;
                }
                out.push(if i - start >= 2 {
                    Glob::DoubleStar
                } else {
                    Glob::Star
                });
            }
            c => {
                out.push(Glob::Literal(c));
                i += 1;
            }
        }
    }
    out
}

/// Match `glob` against `text` (`/`-separated relative path).
pub fn glob_matches(glob: &[Glob], text: &str) -> bool {
    // Fast path: no wildcards at all — plain comparison, no memo table.
    if glob.iter().all(|g| matches!(g, Glob::Literal(_))) {
        let expected: String = glob
            .iter()
            .map(|g| match g {
                Glob::Literal(c) => *c,
                _ => unreachable!(),
            })
            .collect();
        return expected == text;
    }

    let chars: Vec<char> = text.chars().collect();
    let mut memo = vec![0u8; (glob.len() + 1) * (chars.len() + 1)];
    glob_from(glob, &chars, 0, 0, &mut memo)
}

/// Depth-first match with memoization. Every recursive call advances `gi`,
/// `ti`, or both, so recursion is bounded by `len(glob) + len(text)`.
fn glob_from(glob: &[Glob], text: &[char], gi: usize, ti: usize, memo: &mut [u8]) -> bool {
    let stride = text.len() + 1;
    let slot = gi * stride + ti;
    if memo[slot] != 0 {
        return memo[slot] == 1;
    }

    let matched = if gi == glob.len() {
        ti == text.len()
    } else {
        match glob[gi] {
            Glob::Literal(c) => {
                ti < text.len() && text[ti] == c && glob_from(glob, text, gi + 1, ti + 1, memo)
            }
            Glob::Any => {
                ti < text.len()
                    && text[ti] != '/'
                    && glob_from(glob, text, gi + 1, ti + 1, memo)
            }
            Glob::Star => {
                (ti < text.len()
                    && text[ti] != '/'
                    && glob_from(glob, text, gi, ti + 1, memo))
                    || glob_from(glob, text, gi + 1, ti, memo)
            }
            Glob::DoubleStar => {
                // `**/foo` also matches `foo` — the separator itself is optional.
                let skip_separator = glob.get(gi + 2) == Some(&Glob::Literal('/'))
                    && glob_from(glob, text, gi + 3, ti, memo);
                skip_separator
                    || glob_from(glob, text, gi + 2, ti, memo)
                    || (ti < text.len() && glob_from(glob, text, gi, ti + 1, memo))
            }
        }
    };

    memo[slot] = if matched { 1 } else { 2 };
    matched
}

// ---------------------------------------------------------------------------
// .gitignore line parsing
// ---------------------------------------------------------------------------

/// One parsed `.gitignore` line.
#[derive(Debug)]
struct Pattern {
    /// `!pattern` — re-include instead of exclude.
    negated: bool,
    /// `pattern/` — only matches directories.
    dir_only: bool,
    /// The pattern contains a `/` → anchored to the ignore-file root,
    /// otherwise it matches a basename at any depth.
    anchored: bool,
    glob: Vec<Glob>,
}

/// Parse the contents of a `.gitignore` file. Comments/blank lines are dropped.
fn parse_gitignore(contents: &str) -> Vec<Pattern> {
    contents.lines().filter_map(parse_line).collect()
}

/// Parse a single `.gitignore` line. Returns `None` for comments and blanks.
fn parse_line(raw: &str) -> Option<Pattern> {
    // Only trailing whitespace is stripped (leading spaces are significant,
    // and `\#` / `\!` escapes are handled by the glob parser).
    let line = raw.trim_end();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let mut body = line;
    let negated = body.starts_with('!');
    if negated {
        body = &body[1..];
    }

    // A trailing `/` makes the pattern directory-only.
    let dir_only = body.ends_with('/');
    if dir_only {
        body = &body[..body.len() - 1];
    }

    // After removing the trailing separator, any remaining `/` (leading or
    // interior) anchors the pattern to the ignore-file root.
    let anchored = body.contains('/');
    let body = body.strip_prefix('/').unwrap_or(body);

    if body.is_empty() {
        return None;
    }

    Some(Pattern {
        negated,
        dir_only,
        anchored,
        glob: parse_glob(body),
    })
}

/// Render a relative path as a `/`-separated string.
fn to_slash(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

// ---------------------------------------------------------------------------
// IgnoreRules
// ---------------------------------------------------------------------------

/// Ignore rules for one walked root directory (its `.gitignore` plus the
/// defaults). Load once per walk, then query per entry.
#[derive(Debug)]
pub struct IgnoreRules {
    root: PathBuf,
    patterns: Vec<Pattern>,
}

impl IgnoreRules {
    /// Read `<root>/.gitignore`. A missing or unreadable file yields rules
    /// with no patterns (only [`DEFAULT_IGNORED`] applies).
    pub fn load(root: &Path) -> Self {
        let patterns = std::fs::read_to_string(root.join(".gitignore"))
            .map(|contents| parse_gitignore(&contents))
            .unwrap_or_default();
        Self {
            root: root.to_path_buf(),
            patterns,
        }
    }

    /// The directory whose `.gitignore` these rules were loaded from.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Check a single entry whose path is relative to [`IgnoreRules::root`].
    ///
    /// Ancestors are assumed clean — walkers only ever reach this for entries
    /// below a parent that was not itself ignored.
    pub fn entry_ignored(&self, rel_path: &Path, is_dir: bool) -> bool {
        if self.patterns.is_empty() {
            return false;
        }
        let rel = to_slash(rel_path);
        if rel.is_empty() {
            return false;
        }
        self.eval(&rel, is_dir)
    }

    /// Full check for a path relative to [`IgnoreRules::root`]: the path is
    /// ignored when it — or any ancestor directory — matches an excluding
    /// pattern (git cannot re-include below an excluded directory).
    pub fn is_ignored(&self, rel_path: &Path, is_dir: bool) -> bool {
        if self.patterns.is_empty() {
            return false;
        }
        let rel = to_slash(rel_path);
        if rel.is_empty() {
            return false;
        }

        let components: Vec<&str> = rel.split('/').collect();
        for i in 0..components.len().saturating_sub(1) {
            let prefix = components[..=i].join("/");
            if self.eval(&prefix, true) {
                return true;
            }
        }
        self.eval(&rel, is_dir)
    }

    /// Last-match-wins evaluation of every pattern against `rel`.
    fn eval(&self, rel: &str, is_dir: bool) -> bool {
        let name = rel.rsplit('/').next().unwrap_or(rel);
        let mut ignored = false;
        for pattern in &self.patterns {
            if pattern.dir_only && !is_dir {
                continue;
            }
            let subject = if pattern.anchored { rel } else { name };
            if glob_matches(&pattern.glob, subject) {
                ignored = !pattern.negated;
            }
        }
        ignored
    }
}

// ---------------------------------------------------------------------------
// Cached, depth-aware free functions
// ---------------------------------------------------------------------------

/// Cache for [`is_ignored`]: remembers which directory supplies a
/// `.gitignore` and the rules already parsed from it.
#[derive(Default)]
struct RuleCache {
    /// directory → nearest ancestor (or itself) holding a `.gitignore`.
    gitignore_roots: HashMap<PathBuf, Option<PathBuf>>,
    /// `.gitignore` root → parsed rules.
    rules: HashMap<PathBuf, Rc<IgnoreRules>>,
}

thread_local! {
    static RULE_CACHE: RefCell<RuleCache> = RefCell::new(RuleCache::default());
}

/// Nearest ancestor of `start` (inclusive) containing a `.gitignore`.
/// Every directory visited on the way up is memoized, so repeat lookups are
/// O(1). Bounded to 64 levels so a `.gitignore`-less tree never walks to `/`.
fn gitignore_root_for(start: &Path) -> Option<PathBuf> {
    RULE_CACHE.with(|cell| {
        let mut cache = cell.borrow_mut();
        let mut current = Some(start.to_path_buf());
        let mut visited: Vec<PathBuf> = Vec::new();
        let mut resolved: Option<PathBuf> = None;
        let mut hops = 0usize;

        while let Some(dir) = current {
            if hops > 64 {
                break;
            }
            if let Some(cached) = cache.gitignore_roots.get(&dir) {
                resolved = cached.clone();
                break;
            }
            visited.push(dir.clone());
            if dir.join(".gitignore").is_file() {
                resolved = Some(dir);
                break;
            }
            current = dir.parent().map(Path::to_path_buf);
            hops += 1;
        }

        for dir in visited {
            cache.gitignore_roots.insert(dir, resolved.clone());
        }
        resolved
    })
}

/// Rules for the nearest `.gitignore` above `path`, loaded once per root.
fn cached_rules_for(path: &Path) -> Option<Rc<IgnoreRules>> {
    let root = gitignore_root_for(path)?;
    RULE_CACHE.with(|cell| {
        let mut cache = cell.borrow_mut();
        if let Some(rules) = cache.rules.get(&root) {
            return Some(rules.clone());
        }
        let rules = Rc::new(IgnoreRules::load(&root));
        cache.rules.insert(root, rules.clone());
        Some(rules)
    })
}

/// Depth-aware ignore check for a single path.
///
/// `depth` is the path's depth relative to the walk root (the root itself is
/// `0`). Returns `true` when the entry must be skipped during a walk:
///
/// * deeper than `max_depth`,
/// * carrying a [`DEFAULT_IGNORED`] name anywhere in its path, or
/// * matched (directly or via an ancestor directory) by the nearest
///   `.gitignore`.
pub fn is_ignored(path: &Path, depth: usize, max_depth: usize) -> bool {
    if depth > max_depth {
        return true;
    }

    for component in path.components() {
        let name = component.as_os_str().to_string_lossy();
        if is_name_ignored(&name) {
            return true;
        }
    }

    let rules = match cached_rules_for(path) {
        Some(rules) => rules,
        None => return false,
    };
    let rel = path.strip_prefix(&rules.root).unwrap_or(path);
    // Symlinks are never followed: a symlink is treated as a non-directory.
    let is_dir = std::fs::symlink_metadata(path)
        .map(|m| m.is_dir())
        .unwrap_or(false);
    rules.is_ignored(rel, is_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_names_match_exactly() {
        assert!(is_name_ignored("node_modules"));
        assert!(is_name_ignored("__pycache__"));
        assert!(!is_name_ignored("src"));
        assert!(!is_name_ignored("my_node_modules"));
    }

    #[test]
    fn wildcard_matching() {
        assert!(glob_matches(&parse_glob("*.rs"), "main.rs"));
        assert!(!glob_matches(&parse_glob("*.rs"), "main.rsx"));
        assert!(glob_matches(&parse_glob("dir/*"), "dir/x"));
        // `**` crosses `/`, `*` does not.
        assert!(glob_matches(&parse_glob("**/foo"), "foo"));
        assert!(glob_matches(&parse_glob("**/foo"), "a/b/foo"));
        assert!(glob_matches(&parse_glob("a/**/b"), "a/b"));
        assert!(glob_matches(&parse_glob("a/**/b"), "a/x/y/b"));
        assert!(!glob_matches(&parse_glob("a/**/b"), "ab"));
        assert!(!glob_matches(&parse_glob("dir/*"), "dir/sub/x"));
        // Escapes make the next character literal.
        assert!(glob_matches(&parse_glob("escaped\\!name"), "escaped!name"));
    }

    #[test]
    fn gitignore_line_semantics() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".gitignore"),
            "# comment\n\ndist/\n*.log\n!keep.log\n/root_only.txt\n",
        )
        .unwrap();

        let rules = IgnoreRules::load(dir.path());

        // Trailing `/` → directory only.
        assert!(rules.entry_ignored(Path::new("dist"), true));
        assert!(!rules.entry_ignored(Path::new("dist"), false));
        // Unanchored → matches at any depth.
        assert!(rules.entry_ignored(Path::new("src/app.log"), false));
        // Last match wins → negation re-includes.
        assert!(!rules.entry_ignored(Path::new("keep.log"), false));
        // Leading `/` → anchored to the ignore-file root.
        assert!(rules.entry_ignored(Path::new("root_only.txt"), false));
        assert!(!rules.entry_ignored(Path::new("sub/root_only.txt"), false));
        // An excluded directory excludes everything below it.
        assert!(rules.is_ignored(Path::new("dist/deep/file.txt"), false));
        assert!(!rules.is_ignored(Path::new("src/app.rs"), false));
    }

    #[test]
    fn missing_gitignore_yields_no_patterns() {
        let dir = tempfile::tempdir().unwrap();
        let rules = IgnoreRules::load(dir.path());
        assert!(!rules.entry_ignored(Path::new("anything.txt"), false));
    }

    /// The depth-aware free function is what the file watcher leans on: it
    /// combines the depth cap, the default names and the cached `.gitignore`.
    #[test]
    fn depth_aware_free_function() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        std::fs::write(root.join(".gitignore"), "*.log\n").unwrap();

        // Deeper than the walk limit → skipped regardless of anything else.
        assert!(is_ignored(&root.join("src/a/b/c.rs"), 13, 12));
        // A default-ignored name on any component of the path → skipped.
        assert!(is_ignored(&root.join("node_modules/pkg/index.js"), 3, 12));
        // The root's `.gitignore` applies to its descendants.
        assert!(is_ignored(&root.join("debug.log"), 1, 12));
        // Regular file, inside the depth limit, matching nothing → kept.
        assert!(!is_ignored(&root.join("src/lib.rs"), 2, 12));
    }
}
