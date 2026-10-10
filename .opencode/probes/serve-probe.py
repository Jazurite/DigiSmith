#!/usr/bin/env python3 -I
"""Starts `opencode serve` (cwd = worktree) with an extra agent `probe`: the SAME permission object as `maestro`, no prompt.
Reason: the maestro prompt makes the model refuse secret calls before the permission engine is tested. Usage: serve-probe.py <port>"""
import json, os, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
cfg = json.load(open(root / "opencode.json"))
m = cfg["agent"]["maestro"]
extra = {"agent": {"probe": {"mode": "primary", "model": m["model"], "permission": m["permission"], "description": "permission test only"}}}
env = dict(os.environ, OPENCODE_CONFIG_CONTENT=json.dumps(extra))
os.chdir(root)
os.execvpe("opencode", ["opencode", "serve", "--hostname", "127.0.0.1", "--port", sys.argv[1]], env)
