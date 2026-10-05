#!/usr/bin/env node
// Spike prototype for DGS-154 (E.4 Flux): can a plain Node setInterval process
// be the maestro's post-clear kicker? See brief.md in this directory.
//
// Detection signal (question A): /root/.claude/sessions/<pid>.json is written by
// the Desktop app itself and carries {hostSessionId, status: "busy"|"idle",
// statusUpdatedAt}. We resolve the target Desktop session's current pid once by
// matching hostSessionId, then just re-read that one small JSON file every tick.
// No jsonl parsing, no transcript heuristics, no secrets.
//
// Delivery (question B): UNTESTED. The one documented, non-secret path found is
// `claude --resume <sessionId> --print <text>`. Running it against a session that
// is already held open by a live Desktop ccd-cli process is exactly "sending to
// that session" -- this script will refuse to do it unless --unsafe-real-send is
// passed, and this spike never passes that flag itself.

import { readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const SESSIONS_DIR = '/root/.claude/sessions';

function usage() {
  console.error(
    'usage: kicker.mjs <hostSessionId> [--interval-ms N] [--wake-text TEXT] [--dry-run] [--unsafe-real-send]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) usage();

const target = args[0];
let intervalMs = 10_000;
let wakeText = 'resume';
let dryRun = false;
let unsafeRealSend = false;

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--interval-ms') intervalMs = Number(args[++i]);
  else if (a === '--wake-text') wakeText = args[++i];
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--unsafe-real-send') unsafeRealSend = true;
  else usage();
}

function nowStamp() {
  const d = new Date();
  const utc7 = new Date(d.getTime() + 7 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const u7 = `${utc7.getUTCFullYear()}-${pad(utc7.getUTCMonth() + 1)}-${pad(utc7.getUTCDate())} ${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())}:${pad(utc7.getUTCSeconds())} UTC+7`;
  const utc = d.toISOString();
  return `${u7} [${utc}]`;
}

// Resolve hostSessionId -> pid by scanning the small per-pid json files.
// Read-only: we never touch the sibling *.key files (signing keys, per brief).
function resolvePid(hostSessionId) {
  let names;
  try {
    names = readdirSync(SESSIONS_DIR).filter((n) => n.endsWith('.json'));
  } catch (e) {
    return { error: `cannot list ${SESSIONS_DIR}: ${e.message}` };
  }
  for (const name of names) {
    try {
      const d = JSON.parse(readFileSync(`${SESSIONS_DIR}/${name}`, 'utf8'));
      if (d.hostSessionId === hostSessionId) {
        return { pid: d.pid, name };
      }
    } catch {
      // skip unreadable/partial file, not fatal
    }
  }
  return { error: `no session file has hostSessionId=${hostSessionId}` };
}

function readStatus(pid) {
  try {
    const d = JSON.parse(readFileSync(`${SESSIONS_DIR}/${pid}.json`, 'utf8'));
    return { status: d.status, sessionId: d.sessionId, statusUpdatedAt: d.statusUpdatedAt, name: d.name };
  } catch (e) {
    return { error: `cannot read ${SESSIONS_DIR}/${pid}.json: ${e.message}` };
  }
}

function deliver(sessionId) {
  const cmdLine = `claude --resume ${sessionId} --print ${JSON.stringify(wakeText)}`;
  if (dryRun || !unsafeRealSend) {
    console.log(`${nowStamp()} would send: ${wakeText}  (command: ${cmdLine})`);
    return;
  }
  // Not exercised by this spike. Left in place only for the armed live test
  // Jack/maestro runs deliberately, never invoked by this script on its own.
  console.log(`${nowStamp()} SENDING for real: ${cmdLine}`);
  const child = spawn('claude', ['--resume', sessionId, '--print', wakeText], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => console.log(`${nowStamp()} send process exited ${code}`));
}

let pid = null;
let idleStreak = 0;
let ticks = 0;

function tick() {
  ticks++;
  if (pid === null) {
    const r = resolvePid(target);
    if (r.error) {
      console.log(`${nowStamp()} tick ${ticks}: UNRESOLVED (${r.error})`);
      return;
    }
    pid = r.pid;
    console.log(`${nowStamp()} tick ${ticks}: resolved ${target} -> pid ${pid} (${r.name})`);
  }

  const s = readStatus(pid);
  if (s.error) {
    // pid file gone: process likely restarted under a new pid. Drop the
    // cached pid so the next tick re-resolves by hostSessionId.
    console.log(`${nowStamp()} tick ${ticks}: pid ${pid} LOST (${s.error}) -- will re-resolve`);
    pid = null;
    idleStreak = 0;
    return;
  }

  if (s.status === 'idle') {
    idleStreak++;
  } else {
    idleStreak = 0;
  }

  console.log(
    `${nowStamp()} tick ${ticks}: pid=${pid} session=${s.sessionId} status=${s.status} idleStreak=${idleStreak}/3 (signal: sessions/<pid>.json statusUpdatedAt=${s.statusUpdatedAt})`
  );

  if (idleStreak >= 3) {
    deliver(s.sessionId);
    idleStreak = 0; // avoid re-sending every tick while it stays idle
  }
}

console.log(`${nowStamp()} kicker starting: target=${target} interval=${intervalMs}ms wakeText=${JSON.stringify(wakeText)} dryRun=${dryRun}`);
tick();
const handle = setInterval(tick, intervalMs);

process.on('SIGINT', () => {
  clearInterval(handle);
  console.log(`${nowStamp()} kicker stopped`);
  process.exit(0);
});
