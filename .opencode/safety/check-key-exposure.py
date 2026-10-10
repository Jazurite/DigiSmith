#!/usr/bin/env python3 -I
"""DGS-334: does a 2.x server (or its files) expose the TokenReply key? Prints route, HTTP status and a boolean per check, NEVER a response body or the key.
Usage: check-key-exposure.py <port> <pass-file> <project-dir> <server-home-dir>. Compares against TOKENREPLY_API_KEY from ~/.digismith-depot/.env, in memory."""
import base64, json, pathlib, re, sys, urllib.request, urllib.error
LIVE = "--live" in sys.argv; sys.argv = [x for x in sys.argv if x != "--live"]
port, pf, proj, home = sys.argv[1], pathlib.Path(sys.argv[2]).expanduser(), sys.argv[3], pathlib.Path(sys.argv[4]).expanduser()
if port == "4198" and not LIVE: sys.exit("the live port needs --live (throwaway servers by default)")
key = re.search(r"^TOKENREPLY_API_KEY=(.*)$", (pathlib.Path.home() / ".digismith-depot/.env").read_text(), re.M).group(1).strip().strip("\"'")
kb = key.encode(); auth = "Basic " + base64.b64encode(("opencode:" + pf.read_text().strip()).encode()).decode()
def get(path):
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers={"Authorization": auth, "x-opencode-directory": proj})
    try:
        with urllib.request.urlopen(r, timeout=60) as f: return f.status, f.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: return type(e).__name__, b""
paths = ["/api/provider", "/api/provider/tokenreply", "/api/config", "/api/model", "/api/model/default", "/api/agent", "/api/integration", "/api/integration/tokenreply", "/api/plugin", "/api/project",
         "/api/location", "/api/permission/saved", "/api/permission/request", "/api/command", "/api/skill", "/api/mcp", "/api/debug/location", "/api/health", "/api/session"]
st, body = get("/api/session")
try: sids = [s["id"] for s in json.loads(body)["data"]][:5]
except Exception: sids = []
for sid in sids: paths += [f"/api/session/{sid}", f"/api/session/{sid}/message", f"/api/session/{sid}/context", f"/api/session/{sid}/export", f"/api/session/{sid}/environment", f"/api/session/{sid}/inbox"]
hit = 0
for p in paths:
    st, body = get(p); has = kb in body; hit += has; print(f"{p.split('/')[1:3] and p[:46]:46} {st!s:>4} key_in_response={has}")
files = 0; fhit = []
for f in home.rglob("*"):
    if f.is_file() and not f.is_symlink() and "node_modules" not in f.parts and f.stat().st_size < 200_000_000:
        try:
            files += 1
            if kb in f.read_bytes(): fhit.append(str(f.relative_to(home)))
        except OSError: pass
print(f"files scanned {files}, files containing the key: {fhit}")
print("RESULT key exposed:", bool(hit or fhit))
