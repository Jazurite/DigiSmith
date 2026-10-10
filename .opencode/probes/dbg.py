#!/usr/bin/env python3 -I
"""Free permission check (no model): runs one tool through `opencode debug agent probe --tool ... --params ...`.
The `probe` agent gets the same permission object as `maestro`. Usage: dbg.py <tool> '<json params>'. Prints at most 200 chars and a canary count."""
import json, os, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[2]
m = json.load(open(root / ".opencode/maestro/opencode.json"))["agent"]["maestro"]
extra = {"agent": {"probe": {"mode": "primary", "model": m["model"], "permission": m["permission"]}}}
env = dict(os.environ, OPENCODE_CONFIG=str(root / ".opencode/maestro/opencode.json"), OPENCODE_CONFIG_CONTENT=json.dumps(extra))
r = subprocess.run(["opencode", "debug", "agent", "probe", "--tool", sys.argv[1], "--params", sys.argv[2]], cwd=root, env=env, capture_output=True, text=True, timeout=100)
out = (r.stdout + r.stderr)
print(" ".join(out.split())[:200], "| canary:", out.count("CANARY-DENY-7731"))
