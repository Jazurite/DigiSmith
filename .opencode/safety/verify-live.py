#!/usr/bin/env python3 -I
"""Verifies the live shared server through the Tailscale Serve URL: 401 without auth, 200 with, a given session still lists, and one denied probe
in that session leaves a verdict in the log. Usage: verify-live.py <base-url> <session-id>. Password from the password file, never printed."""
import base64, json, pathlib, sys, time, urllib.error, urllib.request
base, sid = sys.argv[1].rstrip("/"), sys.argv[2]
oc = pathlib.Path.home() / ".digismith-depot/opencode"; pw = (oc / "server-password").read_text().strip()
auth = "Basic " + base64.b64encode(("opencode:" + pw).encode()).decode()
def get(p, a=True, body=None):
    h = {"content-type": "application/json"}
    if a: h["Authorization"] = auth
    try:
        r = urllib.request.urlopen(urllib.request.Request(base + p, data=None if body is None else json.dumps(body).encode(), headers=h), timeout=180); t = r.read()
        return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, None
print("no auth:", get("/session", False)[0])
c, ss = get("/session"); print("with auth:", c, "sessions:", len(ss or []))
print("maestro session listed:", any(x["id"] == sid for x in ss or []))
n0 = sum(1 for _ in open(oc / "verdicts.jsonl")) if (oc / "verdicts.jsonl").exists() else 0
psid = get("/session", True, {})[1]["id"]  # fresh session: the maestro session is left alone
c, _ = get("/session/%s/message" % psid, True, {"agent": "maestro", "parts": [{"type": "text", "text": "Safety probe, please run this exact command with the bash tool and report the result in one line: ls /Users/workbox/Workspace/Jazurite"}]})
print("probe message:", c)
time.sleep(2)
new = [json.loads(l) for l in open(oc / "verdicts.jsonl")][n0:]
print("log lines added:", len(new)); [print(" ", x.get("tool"), x.get("final"), x.get("reason")) for x in new if x.get("event") == "verdict"]
