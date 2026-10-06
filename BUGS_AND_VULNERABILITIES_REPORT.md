# DWO Bugs and Vulnerabilities Report

**Report Date**: 2026-10-01
**Project**: DWO (Developer Workflow Orchestrator) v2.0.0
**Repository**: /Users/kennethaman/DWO

## Executive Summary

This report documents security vulnerabilities and bugs found in the DWO application. Issues range from critical license key bypass to medium-severity path traversal and XSS risks.

---

## Critical Security Vulnerabilities

### 1. License Key Demo Mode Bypass (CRITICAL)

**File**: `src-tauri/src/license/license.rs`  
**Line**: 102, `VENDOR_PUBLIC_KEY: &str = "";`

The license system ships with `VENDOR_PUBLIC_KEY` set to an empty string by default. The `activate()` method documentation explicitly states:

> "Empty (default): the key *self-verifies* — the embedded public key is used to check the signature. This preserves the demo/test flow but is **not** cryptographically enforced: anyone who can run this binary can mint valid keys."

**Code Path**:
- When `VENDOR_PUBLIC_KEY` is empty, `activate()` uses the Ed25519 key embedded **inside the license itself** for verification
- Anyone can generate a valid license key by signing `"<machine_id>:pro"` with any Ed25519 private key
- No vendor validation occurs — the embedded key from the license is sufficient

**Impact**: 
- Complete bypass of license verification
- Anyone can activate Pro tier features by generating a base64-encoded Ed25519 key pair
- This is not a configuration mistake — it's the default, shipped behavior

**Remediation**:
- Set a proper vendor public key during deployment
- Make `VENDOR_PUBLIC_KEY` required and fail activation if empty in production
- Add runtime enforcement to reject demo-mode activation in production builds

---

### 2. Path Traversal in File System Operations (HIGH)

**File**: `src-tauri/src/fs/fs.rs`  
**Affected Functions**: `write_file`, `create_file`, `create_dir`, `rename`, `delete`

None of the file system operations validate that the target path remains within an allowed base directory. For example:

```rust
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path);
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;  // <-- No containment check
    }
    std::fs::write(path, content).map_err(|e| e.to_string())?;
}
```

A attacker could supply paths like:
- `../../../etc/passwd` 
- `/tmp/../../../var/www/config.php`
- `./secret.key` (relative to working directory)

**Impact**:
- Unauthorized file creation/modification outside intended scope
- Potential reading of sensitive system files
- Website defacement or data exfiltration if DWO has write access to web directories

**Remediation**:
- Add path containment validation against a configured base directory
- Reject paths containing `..` components or absolute paths outside allowed roots
- Run file operations within a sandboxed directory

---

### 3. No Rate Limiting on Authentication Attempts (HIGH)

**File**: `src/contexts/AuthContext.tsx`  
**Functions**: `signInWithEmail`, `registerUser`

The authentication system has no rate limiting on password guesses:

- `signInWithEmail` has a 600ms simulated delay but no attempt counter
- `registerUser` similarly has no rate limiting
- The verification code system (`verifyEmail`) has `MAX_CODE_ATTEMPTS = 3`, but this only applies to the second factor

**Impact**:
- Brute force attacks on user passwords
- No account lockout mechanism
- Potential for credential stuffing attacks

**Remediation**:
- Add rate limiting to sign-in endpoints
- Implement account lockout after N failed attempts
- Add CAPTCHA or similar for repeated failures

---

### 4. LocalStorage Auth State Vulnerable to XSS (MEDIUM)

**File**: `src/contexts/AuthContext.tsx`  
**Storage Keys**: `dwo_users`, `dwo_auth`

User authentication state including emails, names, and roles is stored in plaintext `localStorage`. While passwords are hashed, the raw user data is accessible via XSS.

**Code Path**:
- `readStoredUsers()` reads from `localStorage.getItem('dwo_users')`
- `writeStoredUsers()` writes to `localStorage.setItem('dwo_users')`
- The `dwo_auth` key stores session user data without passwords

**Impact**:
- Session hijacking via XSS
- Theft of user identity information
- Collaborator manipulation if XSS is present

**Remediation**:
- Encrypt sensitive data before storing in localStorage
- Add Content Security Policy (CSP) headers
- Implement proper XSS sanitization in all user-input surfaces

---

### 5. Git Status Exposes Full Repository Paths (LOW)

**File**: `src-tauri/src/git/commands.rs`  
**Function**: `status()`

The `GitStatus` returned by `git status --porcelain=v1` includes raw file paths. When the repository is at a deep directory level, these paths can be absolute or expose the full project structure.

**Impact**:
- Information disclosure about project layout
- Potential reconnaissance for targeted attacks

**Remediation**:
- Strip or relativize paths before returning to frontend
- Only return file names (not full paths) in the UI

---

## Medium-Severity Bugs

### 6. Race Condition in Terminal Session Output Processing (MEDIUM)

**File**: `src-tauri/src/terminal/manager.rs`  
**Function**: `create()`

The `TerminalManager.create()` method spawns an async task that reads from the PTY output channel while the session state is managed by the same `RwLock`. The reader task (`output_rx.recv().await`) and session write operations can race:

```rust
// Reader task (spawned async)
tauri::async_runtime::spawn(async move {
    while let Some(chunk) = output_rx.recv().await {
        reader_session.read().process_output_for_scrollback(&chunk);  // Read lock
        // ... emit event
    }
});

// Main thread may also write to session
manager.write(id, data);  // Also reads session
```

**Impact**:
- Corrupted scrollback buffer
- Lost or duplicated terminal output
- Inconsistent session state

**Remediation**:
- Ensure proper locking discipline between reader and writer
- Use separate session copies for reading vs writing during active output

---

### 7. PTY Resource Leak on Spawn Panic (MEDIUM)

**File**: `src-tauri/src/terminal/pty.rs`  
**Function**: `spawn_shell()`

The `catch_unwind` wrapper around PTY spawning means if the operation panics between creating the PTY and dropping the slave side, resources may not be cleaned up properly:

```rust
let result = catch_unwind(AssertUnwindSafe(|| {
    let pair = pty_system.openpty(size)?;     // PTY created
    let child = pair.slave.spawn_command(cmd_builder)?;  // May panic
    drop(pair.slave);  // May not execute on panic
    // ... rest of setup
}));
```

**Impact**:
- PTY file descriptors left open
- Terminal sessions that can't be properly closed
- Resource exhaustion over time

**Remediation**:
- Use `std::panic::UnwindSafe` with proper cleanup in a `finally` block
- Ensure slave PTY is always dropped, even on panic

---

### 8. Handoff Silent Scrollback Truncation (MEDIUM)

**File**: `src-tauri/src/handoff/manager.rs`  
**Constant**: `MAX_INJECT_LINES: usize = 80`

The `inject()` method truncates scrollback to the last 80 lines without any UI indication to the user that data is being silently dropped:

```rust
let tail_lines: Vec<&str> = artifact
    .scrollback
    .iter()
    .rev()
    .take(MAX_INJECT_LINES)
    .rev()
    .map(|s| s.as_str())
    .collect();
```

**Impact**:
- Users may not realize important context is being lost
- Critical terminal output could be dropped during handoff
- False sense of completeness

**Remediation**:
- Add user notification when scrollback is truncated
- Make the truncation limit configurable
- Show a "show more" indicator in the handoff UI

---

### 9. Empty VENDOR_PUBLIC_KEY Accepted Without Error (MEDIUM)

**File**: `src-tauri/src/license/license.rs`  
**Line**: 102, `pub const VENDOR_PUBLIC_KEY: &str = "";`

The vendor public key defaults to empty string, and the `activate()` method silently falls back to self-verification with a warning log. Administrators may not notice the warning in production logs.

**Impact**:
- Deployments may inadvertently run in insecure demo mode
- No early failure detection during application startup
- Security team may not realize license system is unenforced

**Remediation**:
- Fail fast if `VENDOR_PUBLIC_KEY` is empty in production builds
- Add startup check that panics or exits if vendor key not configured
- Add prominent build-time warning if running in demo mode

---

### 10. Git Stage/Unstage Path Parsing (LOW)

**File**: `src-tauri/src/git/commands.rs`  
**Functions**: `stage()`, `unstage()`

The `--` separator prevents flag-like filenames from being parsed as git flags, but the path handling could still be exploited:

```rust
pub async fn stage(&self, file: &str) -> Result<GitResult, String> {
    self.run_git(&["add", "--", file]).await?;  // -- separator used
}
```

While the `--` separator is correct, there's no path validation or sanitization beyond what git itself provides.

**Impact**:
- Git command injection if path contains special characters
- Unexpected git operations on unintended files

**Remediation**:
- Validate paths exist within the repository before running git commands
- Canonicalize paths and check they're under the repo root
- Escape or validate user-supplied paths

---

## Low-Severity Issues

### 11. No Content-Security-Policy Beyond Nginx Basics

**File**: `nginx.conf`  
**Issue**: The nginx configuration has basic security headers but lacks a comprehensive CSP.

**Impact**:
- Reduced protection against XSS and data injection attacks
- Missing `frame-ancestors` for clickjacking protection

**Remediation**:
- Add `Content-Security-Policy` header with appropriate restrictions
- Add `Frame-Ancestors` directive to prevent clickjacking

### 12. Docker Daemon Access in Native Build

**File**: `Dockerfile`  
**Issue**: The native build stage installs `build-essential`, `libgtk-3-dev`, and other development packages that expand the attack surface.

**Impact**:
- Larger Docker image surface area
- More potential CVEs in build dependencies

**Remediation**:
- Use distroless base images for native binaries
- Minimize installed packages to only what's needed

### 13. License Key Generation Uses Weak Randomness (LOW)

**File**: `src-tauri/src/license/license.rs`  
**Function**: `generate_keypair()`

The `generate_keypair()` function uses `thread_rng()` from the `rand` crate, which is generally secure but worth noting in the context of the overall license system weaknesses.

**Impact**:
- Minor, only relevant if demo mode is being used

**Remediation**:
- Not critical given the primary license bypass vulnerability

---

## Recommendations Summary

### Immediate (Fix within 48 hours):
1. **Set VENDOR_PUBLIC_KEY** or add runtime enforcement to reject empty keys
2. **Add path containment checks** to all file system operations
3. **Add rate limiting** to authentication endpoints

### Short-term (Fix within 2 weeks):
4. **Add XSS protections** and CSP headers
5. **Fix race condition** in terminal session management
6. **Add user notification** for handoff scrollback truncation
7. **Fail fast** if vendor key not configured

### Medium-term (Fix within 1 month):
8. **Implement proper path sanitization** in git operations
9. **Encrypt sensitive localStorage data**
10. **Reduce Docker attack surface**

### Future Enhancement:
11. **Add full security audit** of all command handlers
12. **Implement runtime security monitoring**
13. **Add security-focused testing** (fuzz testing, penetration testing)