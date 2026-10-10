#!/usr/bin/env python3 -I
"""DGS-334: install the OpenCode 2.x server setup and (re)start the shared server on v2, with automatic fallback to 1.18.35.
Usage: switch-v2.py --port 4198 --home ~/.digismith-depot/opencode/v2 --pass-file <file> --log <file> --project <dir> [--rehearsal]
Order: stop what listens on the port (by PID) -> stable 2.x -> beta 2.x -> 1.18.35 with start-shared-server.py. A 2.x candidate counts only if it LISTENS within 60 s and the safety
plugin logs a new `loaded` line after one session request (40 s). Passwords are read from the file and passed as env; stdout/stderr of the server go to a mode-600 log that is never printed.
--rehearsal: do not touch anything on the live port 4198 (refuses it) and skip the 1.x fallback."""
import argparse, json, os, pathlib, re, shutil, signal, subprocess, sys, time, urllib.request, base64
ap = argparse.ArgumentParser()
ap.add_argument("--port", required=True); ap.add_argument("--home", required=True); ap.add_argument("--pass-file", required=True)
ap.add_argument("--candidates", default="stable,beta", help="comma list: stable (2.0.26 in ~/.opencode/bin), beta (throwaway install)"); ap.add_argument("--log", required=True); ap.add_argument("--project", required=True); ap.add_argument("--rehearsal", action="store_true")
a = ap.parse_args()
HOME = pathlib.Path.home(); REPO = pathlib.Path(__file__).resolve().parents[2]; V2 = pathlib.Path(a.home).expanduser(); PROJ = pathlib.Path(a.project).resolve()
if a.rehearsal and a.port == "4198": sys.exit("rehearsal never uses the live port")
SAFE = REPO / ".opencode/safety"; verd = HOME / ".digismith-depot/opencode/verdicts.jsonl" if not a.rehearsal else V2 / "verdicts.jsonl"
pw = pathlib.Path(a.pass_file).expanduser().read_text().strip()
now = lambda: time.strftime("%H:%M:%S")
def say(m): print(now(), m, flush=True)

def install():
    """Copy the repo source to the v2 home (the repo stays the source of truth)."""
    for d in ("maestro", "prompts", "plugin-safety", "xdg/c", "xdg/d", "xdg/s", "xdg/k"): (V2 / d).mkdir(parents=True, exist_ok=True)
    shutil.copytree(REPO / ".opencode/prompts", V2 / "prompts", dirs_exist_ok=True)
    shutil.copy(SAFE / "maestro-safety.js", V2 / "plugin-safety/maestro-safety.js"); shutil.copy(SAFE / "maestro-safety-v2.js", V2 / "plugin-safety/server.js")
    (V2 / "plugin-safety/package.json").write_text('{"type":"module"}\n')   # key plugin (tokenreply-key-v2.js) not installed: ctx.provider.transform does not exist in the beta runtime
    if not (V2 / "node_modules/@opencode/plugin").exists():   # 2.x plugin directories import @opencode/plugin: pnpm only (its ignored-build exit code is fine)
        (V2 / "package.json").write_text('{"name":"opencode-v2-home","private":true}\n')
        subprocess.run(["pnpm", "add", "@opencode/plugin@2.0.26"], cwd=V2, capture_output=True, text=True, timeout=180)
    for d in ("plugin-safety",):
        l = V2 / d / "node_modules"
        if not l.exists() and not l.is_symlink(): l.symlink_to("../node_modules")
    cfg = json.load(open(REPO / ".opencode/maestro/opencode.json"))
    glob = json.load(open(HOME / ".config/opencode/opencode.json"))["provider"]["tokenreply"]   # 1.x global provider block: npm package and baseURL (its apiKey is an env reference, dropped)
    prov = cfg.setdefault("provider", {}).setdefault("tokenreply", {})
    prov["npm"] = glob["npm"]; prov["name"] = glob["name"]; prov["options"] = {"baseURL": glob["options"]["baseURL"]}
    cfg["plugin"] = [str(V2 / "plugin-safety")]
    (V2 / "maestro/opencode.json").write_text(json.dumps(cfg, indent=1))

def pids_on(port):
    r = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"], capture_output=True, text=True).stdout.split()
    return [int(x) for x in r]
def listening(port): return bool(pids_on(port))
def stop_pid(pid, wait=15):
    try: os.kill(pid, signal.SIGTERM)
    except ProcessLookupError: return
    t = time.time()
    while time.time() - t < wait:
        try: os.kill(pid, 0)
        except ProcessLookupError: return
        time.sleep(0.5)
    try: os.kill(pid, signal.SIGKILL)
    except ProcessLookupError: pass
def loaded(): return verd.read_text().count('"event":"loaded"') if verd.exists() else 0
def req(port, path, method="GET", body=None, timeout=30):
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={"Authorization": "Basic " + base64.b64encode(("opencode:" + pw).encode()).decode(), "content-type": "application/json", "x-opencode-directory": str(PROJ)})
    return urllib.request.urlopen(r, timeout=timeout).status

def start_v2(binary, label):
    env = {"PATH": f"{pathlib.Path(binary).parent}:/usr/bin:/bin", "HOME": str(HOME), "XDG_CONFIG_HOME": str(V2/"xdg/c"), "XDG_DATA_HOME": str(V2/"xdg/d"), "XDG_STATE_HOME": str(V2/"xdg/s"),
           "XDG_CACHE_HOME": str(V2/"xdg/k"), "OPENCODE_DISABLE_AUTOUPDATE": "1", "OPENCODE_CONFIG": str(V2/"maestro/opencode.json"), "OPENCODE_SAFETY": "1",
           "SAFETY_ALLOWED_WS": os.environ.get("SAFETY_ALLOWED_WS", "w2"), "OPENCODE_SERVER_PASSWORD": pw}
    if a.rehearsal: env["SAFETY_LOG"] = str(verd)
    lg = pathlib.Path(a.log); fd = os.open(lg, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600); os.chmod(lg, 0o600)
    before = loaded()
    p = subprocess.Popen([binary, "serve", "--hostname", "127.0.0.1", "--port", a.port], cwd=PROJ, env=env, stdin=subprocess.DEVNULL, stdout=fd, stderr=fd, start_new_session=True)
    say(f"{label}: started pid {p.pid}")
    t = time.time()
    while time.time() - t < 60 and not listening(a.port) and p.poll() is None: time.sleep(1)
    if not listening(a.port): say(f"{label}: NOT listening in 60 s"); stop_pid(p.pid, 5); return None
    say(f"{label}: listening after {int(time.time()-t)} s")
    # 2.x loads server plugins lazily: a session request AND a plugin-list request (GET /api/plugin) for the project folder trigger it.
    for path, m, body in (("/api/session", "POST", {"location": {"directory": str(PROJ)}}), ("/api/plugin", "GET", None)):
        try: req(a.port, path, m, body)
        except Exception as e: say(f"{label}: {path} request failed: {type(e).__name__}")
    t = time.time()
    while time.time() - t < 40 and loaded() <= before: time.sleep(1)
    if loaded() <= before: say(f"{label}: safety plugin did NOT log loaded"); stop_pid(p.pid, 5); return None
    say(f"{label}: safety plugin loaded"); return p.pid

install(); say("v2 home installed")
t0 = time.time()
if not a.rehearsal:
    for pid in pids_on(a.port): say(f"stopping old server pid {pid}"); stop_pid(pid)
if listening(a.port): sys.exit(f"port {a.port} still busy")
pid = None
BIN = {"stable": str(HOME / ".opencode/bin/opencode"), "beta": str(HOME / ".digismith-depot/opencode2-test/beta/node_modules/.bin/opencode2")}
for label in a.candidates.split(","):
    binary = BIN[label]
    pid = start_v2(binary, label)
    if pid: break
if pid:
    (HOME / ".digismith-depot/opencode/server.pid").write_text(str(pid)) if not a.rehearsal else None
    say(f"RESULT v2 {label} pid {pid}, downtime {int(time.time()-t0)} s"); sys.exit(0)
if a.rehearsal: say("RESULT rehearsal: no v2 candidate worked"); sys.exit(1)
say("FALLBACK to 1.18.35")
shim = V2 / "v1bin"; shim.mkdir(exist_ok=True); link = shim / "opencode"
if link.exists() or link.is_symlink(): link.unlink()
link.symlink_to(HOME / ".opencode/bin/opencode-1.18.35")
r = subprocess.run(["/usr/bin/python3", "-I", str(SAFE / "start-shared-server.py"), str(PROJ), a.port], env=dict(os.environ, PATH=f"{shim}:{os.environ['PATH']}"), capture_output=True, text=True)
say(f"RESULT v1 fallback rc {r.returncode}: {r.stdout.strip()[-200:]} downtime {int(time.time()-t0)} s"); sys.exit(r.returncode)
