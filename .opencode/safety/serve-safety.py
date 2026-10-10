#!/usr/bin/env python3 -I
"""DGS-226 throwaway server: `opencode serve` (cwd = worktree) with the safety plugin loaded and OPENCODE_SAFETY=1.
Agents: the template's maestro and maestro-review, plus `probe` (same permission block as maestro, no prompt) and `probe-open` (config allows everything, so only the plugin guards).
Usage: serve-safety.py <port> <workdir> [reviewer-url]   workdir gets: pass (fresh random password, mode 600), verdicts.jsonl (log), server.pid
The live server (4198) and the global plugin folder are never touched. A bad reviewer-url proves the fail-closed path."""
import json, os, pathlib, secrets, sys
root = pathlib.Path(__file__).resolve().parents[2]
port, work = sys.argv[1], pathlib.Path(sys.argv[2]); work.mkdir(parents=True, exist_ok=True)
if port == "4198": sys.exit("never the live port")
pw = work / "pass"
if not pw.exists():
    fd = os.open(pw, os.O_WRONLY | os.O_CREAT, 0o600); os.write(fd, secrets.token_hex(16).encode()); os.close(fd)
cfg = json.load(open(root / "opencode.json")); m = cfg["agent"]["maestro"]
extra = {"plugin": ["file://" + str(root / ".opencode/safety/maestro-safety.js")],
         "agent": {"probe": {"mode": "primary", "model": m["model"], "permission": m["permission"], "description": "permission test only"},
                   "probe-open": {"mode": "primary", "model": m["model"], "description": "plugin test: config allows everything, only the plugin guards",
                                  "permission": {"bash": "allow", "read": "allow", "edit": "allow", "list": "allow", "grep": "allow", "glob": "allow", "webfetch": "allow", "external_directory": "allow", "task": "allow"}},
                   "probe-open-sonnet": {"mode": "primary", "model": "tokenreply/claude-sonnet-5-5", "description": "plugin test with a stronger model",
                                         "permission": {"bash": "allow", "read": "allow", "edit": "allow", "list": "allow", "grep": "allow", "glob": "allow", "webfetch": "allow", "external_directory": "allow", "task": "allow"}}}}
env = dict(os.environ, OPENCODE_CONFIG_CONTENT=json.dumps(extra), OPENCODE_SAFETY="1", OPENCODE_SERVER_PASSWORD=pw.read_text(),
           SAFETY_LOG=str(work / "verdicts.jsonl"), SAFETY_ALLOWED_WS="w2")
if len(sys.argv) > 3: env["SAFETY_REVIEWER_URL"] = sys.argv[3]
os.chdir(root)
(work / "server.pid").write_text(str(os.getpid()))  # execvpe keeps the PID
os.execvpe("opencode", ["opencode", "serve", "--hostname", "127.0.0.1", "--port", port], env)
