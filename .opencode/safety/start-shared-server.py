#!/usr/bin/env python3 -I
"""Starts the shared OpenCode server detached (own session, parent launchd, no herdr), ALWAYS with OPENCODE_SAFETY=1, then checks that the
safety plugin logged a new `loaded` line within 40 s; if not, it stops the server and exits 1 (fail closed).
Usage: start-shared-server.py <project-dir> [port=4198]. The password comes from the password file and is never printed.
Stop the old server first, by PID."""
import base64, json, os, pathlib, subprocess, sys, time, urllib.request
proj = pathlib.Path(sys.argv[1]).resolve(); port = sys.argv[2] if len(sys.argv) > 2 else "4198"
oc = pathlib.Path.home() / ".digismith-depot/opencode"; log = oc / "verdicts.jsonl"
pw = (oc / "server-password").read_text().strip()
def loaded(): return log.read_text().count('"event":"loaded"') if log.exists() else 0
before = loaded()
env = dict(os.environ, OPENCODE_SAFETY="1", SAFETY_ALLOWED_WS=os.environ.get("SAFETY_ALLOWED_WS", "w2"), OPENCODE_SERVER_PASSWORD=pw)
out = open(oc / "server.log", "ab"); os.chmod(oc / "server.log", 0o600)
p = subprocess.Popen(["opencode", "serve", "--hostname", "127.0.0.1", "--port", port], cwd=proj, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=out, start_new_session=True)
(oc / "server.pid").write_text(str(p.pid)); os.chmod(oc / "server.pid", 0o600)
auth = "Basic " + base64.b64encode(("opencode:" + pw).encode()).decode()
# OpenCode loads plugins lazily, per project instance, on the first request for that directory. Send ONE request (long timeout), then wait for `loaded`.
time.sleep(3); status = "?"
try:
    status = str(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%s/session?directory=%s" % (port, proj), headers={"Authorization": auth}), timeout=120).status)
except Exception as e: status = str(getattr(e, "code", type(e).__name__))
t0 = time.time(); ok = False
while time.time() - t0 < 20 and not ok:
    ok = loaded() > before
    if not ok: time.sleep(1)
seen = [status]
if not ok:
    p.terminate(); print("trigger results:", ",".join(seen), "| log exists:", log.exists(), "| loaded lines:", loaded(), "before:", before)
    print("FAIL: no `loaded` line from the safety plugin within 40 s; server stopped"); sys.exit(1)
print("OK: server pid %d on 127.0.0.1:%s, safety plugin loaded" % (p.pid, port))
