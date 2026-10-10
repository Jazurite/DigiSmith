#!/usr/bin/env python3 -I
"""DGS-334 model test for a 2.x server: one luna reply (agent maestro) and one sonnet reply (switch model), safety plugin loaded, key not in the server's environment.
Usage: probe-v2-models.py <port> <pass-file> <project-dir> <verdicts.jsonl>. Prints reply text and booleans only, never the password or a key. Cost: two tiny prompts (about $0.01)."""
import base64, json, pathlib, subprocess, sys, time, urllib.request
LIVE = "--live" in sys.argv; LUNA_ONLY = "--luna-only" in sys.argv; sys.argv = [x for x in sys.argv if x not in ("--live", "--luna-only")]
port, pf, proj, verd = sys.argv[1], pathlib.Path(sys.argv[2]).expanduser(), sys.argv[3], pathlib.Path(sys.argv[4]).expanduser()
if port == "4198" and not LIVE: sys.exit("the live port needs --live (throwaway servers by default)")
auth = "Basic " + base64.b64encode(("opencode:" + pf.read_text().strip()).encode()).decode()
def rq(path, m="GET", b=None, t=60):
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=m, data=None if b is None else json.dumps(b).encode(),
                               headers={"Authorization": auth, "content-type": "application/json", "x-opencode-directory": proj})
    with urllib.request.urlopen(r, timeout=t) as f: raw = f.read(); return json.loads(raw) if raw else {}
plugins = {p.get("id"): p["state"]["status"] for p in rq("/api/plugin")["data"] if not str(p.get("id", "opencode.")).startswith("opencode.")}
print("plugins:", plugins)
print("safety loaded lines:", verd.read_text().count('"event":"loaded"') if verd.exists() else 0)
def run(agent, model, text, label):
    """One fresh session per agent and model (the config's agent model is not applied by the 2.x agent switch)."""
    sid = rq("/api/session", "POST", {"location": {"directory": proj}})["data"]["id"]
    rq(f"/api/session/{sid}/agent", "POST", {"agent": agent})
    rq(f"/api/session/{sid}/model", "POST", {"model": {"id": model, "providerID": "tokenreply"}})   # a new session starts on the server default (opencode/exo-free): set the model explicitly
    rq(f"/api/session/{sid}/prompt", "POST", {"text": text}); t = time.time()
    while time.time() - t < 90:
        time.sleep(3); msgs = rq(f"/api/session/{sid}/message")["data"]; asst = [m for m in msgs if m.get("type") == "assistant" and m.get("time", {}).get("completed")]
        if asst:
            m = asst[-1]; txt = "".join(p.get("text", "") for p in m.get("content", []) if isinstance(p, dict)) if isinstance(m.get("content"), list) else str(m.get("content"))[:200]
            print(f"{label}: {txt.strip()[:200]!r} error={m.get('error')} model={m.get('model')} cost={rq(f'/api/session/{sid}')['data'].get('cost')}"); return
    print(f"{label}: no completed reply in 90 s")
run("maestro", "gpt-5.6-luna", "Reply with the single word OK.", "luna/maestro")
if not LUNA_ONLY: run("maestro-review", "claude-sonnet-5-5", "Reply with the single word FINE.", "sonnet/maestro-review")
pid = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"], capture_output=True, text=True).stdout.split()[0]
env = subprocess.run(["ps", "eww", "-p", pid], capture_output=True, text=True).stdout
print("TOKENREPLY in server env:", "TOKENREPLY" in env)
