#!/usr/bin/env node
/**
 * DWO dev-server orchestrator — used as the Tauri `beforeDevCommand`.
 *
 * Why this exists (verified failure modes of a plain `npm run dev`):
 *
 *  1. Orphaned dev servers. When a previous `tauri dev` session ended badly
 *     (crash, partial Ctrl+C, terminal close), its detached `next-server`
 *     child can be left behind, still listening on :3000. The next
 *     `next dev` then silently falls back to :3001, but Tauri's `devUrl`
 *     stays `http://localhost:3000` — so the app window keeps loading the
 *     STALE server (and when that orphan dies, the window is stuck on a
 *     dead connection with no recovery). This script detects and
 *     terminates `next dev` / `next-server` listeners on :3000 that belong
 *     to THIS repo before starting the new one.
 *
 *  2. Silent port drift. Without strict port enforcement, Next.js picks the
 *     next free port instead of failing. Tauri has no way to know, so the
 *     app window silently talks to the wrong server. This script detects
 *     the drift in the dev server's output and hard-fails instead, so
 *     `tauri dev` stops with a visible error.
 *
 *  3. Orphan creation on quit. `next dev` detaches its own `next-server`
 *     child, which owns the :3000 socket and survives SIGINT/SIGTERM to
 *     the parent — that is exactly how orphans get created. On shutdown
 *     this script terminates any remaining :3000 listener that belongs to
 *     this repo.
 */
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const pExecFile = promisify(execFile);

const PORT = 3000;
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/** Walk up from cwd to the repo root (dir containing package.json + src-tauri). */
function findRepoRoot() {
  let dir = process.cwd();
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'src-tauri', 'tauri.conf.json'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      console.error('[dev-server] could not find the DWO repo root above ' + process.cwd());
      process.exit(1);
    }
    dir = parent;
  }
}

/** PIDs currently LISTENING on the given TCP port (async, best effort). */
async function listenersOnPort(port) {
  if (IS_MAC) {
    try {
      const { stdout } = await pExecFile('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(Number);
    } catch {
      return [];
    }
  }
  if (IS_LINUX) {
    try {
      const { stdout } = await pExecFile('ss', ['-ltnp']);
      const pids = new Set();
      for (const line of stdout.split('\n')) {
        if (!new RegExp(`:${port}\\b`).test(line)) continue;
        for (const m of line.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  // Unsupported platform: skip cleanup; the drift detector still guards us.
  return [];
}

/** Synchronous variant, used on the shutdown path. */
function syncListenersOnPort(port) {
  if (IS_MAC) {
    try {
      const out = execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      return out.trim().split('\n').filter(Boolean).map(Number);
    } catch {
      return [];
    }
  }
  if (IS_LINUX) {
    try {
      const out = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!new RegExp(`:${port}\\b`).test(line)) continue;
        for (const m of line.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  return [];
}

/** Command line of a pid (best effort). */
function cmdlineOf(pid) {
  if (IS_MAC) {
    try {
      return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  }
  if (IS_LINUX) {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ');
    } catch {
      return '';
    }
  }
  return '';
}

/** Working directory of a pid (best effort). */
function cwdOf(pid) {
  if (IS_MAC) {
    try {
      // `lsof -a -d cwd -P -p PID -Fn` -> one "n<cwd>" line
      const out = execFileSync('lsof', ['-a', '-d', 'cwd', '-P', '-p', String(pid), '-Fn'], {
        encoding: 'utf8',
      });
      const line = out.split('\n').find((l) => l.startsWith('n'));
      return line ? line.slice(1) : '';
    } catch {
      return '';
    }
  }
  if (IS_LINUX) {
    try {
      return fs.realpathSync(`/proc/${pid}/cwd`);
    } catch {
      return '';
    }
  }
  return '';
}

/** True when pid is a `next dev` / `next-server` process belonging to this repo. */
function isOurNextDev(pid, repoRoot) {
  const cmd = cmdlineOf(pid);
  if (!/next/i.test(cmd)) return false;
  const cwd = cwdOf(pid);
  return (
    cwd === repoRoot ||
    cwd.startsWith(repoRoot + path.sep) ||
    cmd.includes(repoRoot + path.sep)
  );
}

/** SIGTERM pid, escalate to SIGKILL after ~2s. */
function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // gone
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/**
 * Terminate `next dev` listeners on PORT that belong to this repo.
 * Anything that does not match both the command-line and repo checks is
 * left alone — an unrelated server on :3000 survives, and the drift
 * detector below makes the conflict visible instead of silent.
 */
async function cleanOrphans(repoRoot) {
  for (const pid of await listenersOnPort(PORT)) {
    if (pid === process.pid || pid === process.ppid) continue;
    if (!isOurNextDev(pid, repoRoot)) continue;
    console.log(`[dev-server] terminating orphaned "next dev" (pid ${pid}) still on :${PORT}`);
    killPid(pid);
  }
  // Give terminated processes a moment to release the port.
  for (let i = 0; i < 30; i++) {
    if ((await listenersOnPort(PORT)).length === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  console.warn(`[dev-server] port ${PORT} is still occupied; next dev will not be able to bind it`);
}

/** Kill listeners on the given port that belong to this repo (sync). */
function killOurListeners(repoRoot, port) {
  for (const pid of syncListenersOnPort(port)) {
    if (pid === process.pid) continue;
    if (isOurNextDev(pid, repoRoot)) {
      console.log(`[dev-server] stopping "next dev" listener on :${port} (pid ${pid})`);
      killPid(pid);
    }
  }
}

(async () => {
  const repoRoot = findRepoRoot();
  await cleanOrphans(repoRoot);

  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) {
    console.error('[dev-server] ' + nextBin + ' not found — run `npm install` first');
    process.exit(1);
  }

  const child = spawn(process.execPath, [nextBin, 'dev', '--port', String(PORT)], {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  // Watch the dev server's output for a silent port drift
  // ("⚠ Port 3000 is in use by process N, using available port 3001 instead").
  // When that happens we hard-fail instead of letting Tauri load the wrong server.
  let driftDetected = false;
  let driftPort = PORT + 1;
  let tail = '';
  function onOutput(chunk) {
    const text = chunk.toString();
    process.stdout.write(text);
    tail = (tail + text).slice(-300);
    if (!driftDetected && /Port \d+ is in use by process \d+, using available port \d+/i.test(tail)) {
      driftDetected = true;
      const m = tail.match(/using available port (\d+)/i);
      if (m) driftPort = Number(m[1]);
      console.error(
        `\n[dev-server] "next dev" could not bind :${PORT} and drifted to another port. ` +
          `Tauri's devUrl is hardcoded to :${PORT}, so the app window would load the wrong server. ` +
          `Stop the process that owns :${PORT} (check with: lsof -i :${PORT}) and re-run "npm run tauri dev".`,
      );
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }
  child.stdout.on('data', onOutput);
  child.stderr.on('data', onOutput);

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('error', (e) => {
    console.error('[dev-server] failed to start next dev: ' + e.message);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (driftDetected) {
      // The detached "next-server" now owns the FALLBACK port — stop it,
      // but leave whatever holds :3000 alone (it is not ours).
      killOurListeners(repoRoot, driftPort);
      process.exit(1);
    }
    if (shuttingDown) {
      // Clean quit: stop the detached "next-server" that owns the socket,
      // so quitting `tauri dev` can't orphan it.
      killOurListeners(repoRoot, PORT);
      process.exit(0);
    }
    if (signal) {
      // The child was killed from outside (not by us): the session is
      // broken, fail loudly so `tauri dev` does not keep running without a
      // dev server.
      killOurListeners(repoRoot, PORT);
      process.exit(1);
    }
    // Next.js 15.x exits 0 even when it fails to bind the port (verified
    // with EADDRINUSE on 15.5.25) — so confirm OUR dev server (not some
    // unrelated process that may still hold the port) is actually serving.
    const ourListenerAlive = syncListenersOnPort(PORT).some((pid) =>
      isOurNextDev(pid, repoRoot),
    );
    if (code !== 0 || !ourListenerAlive) {
      killOurListeners(repoRoot, PORT);
      console.error(
        `[dev-server] "next dev" is not serving on :${PORT} — the port is probably held by another process. ` +
          `Check with: lsof -i :${PORT}, free the port, and re-run "npm run tauri dev".`,
      );
      process.exit(1);
    }
    process.exit(0);
  });
})();
