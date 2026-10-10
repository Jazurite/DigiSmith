#!/usr/bin/python3 -I
"""opencode-boot: the ONLY boot script for the shared OpenCode server (DGS-334). Source in the repo (scripts/opencode-boot/), installed to ~/.digismith-depot/bin/opencode-boot by install.sh
together with its payload (~/.digismith-depot/opencode/boot/: maestro config, prompts, safety and key plugins). Used by the LaunchAgent (DGS-331), manual restarts and tests.

What it does: stop what listens on the port (by PID), start OpenCode 2.0.26 (~/.opencode/bin/opencode) from a v2 home with the maestro config, the v2 safety plugin and the v2 key plugin,
require the safety plugin's `loaded` line after one session request and one plugin-list request, and if that fails fall back to ~/.opencode/bin/opencode-1.18.35 with the 1.x setup
(OPENCODE_CONFIG, the global 1.x safety plugin, its loaded check). The server runs detached (own session, parent launchd). The password comes from a file and is passed as an environment
variable; the server's stdout goes to a mode-600 log that is never printed (2.x prints its password at start).

  opencode-boot                 live: port 4198, home ~/.digismith-depot/opencode/v2, password ~/.digismith-depot/opencode/server-password
  opencode-boot --test          throwaway: port 4217, home ~/.digismith-depot/opencode/test, own password file, own log and verdicts; never touches 4198, no 1.x fallback
  --port N  --project DIR  --pass-file F  --log F   override the defaults (--test refuses 4198)
"""
import argparse, base64, json, os, pathlib, shutil, signal, subprocess, sys, time, urllib.request
HOME = pathlib.Path.home(); DEPOT = HOME / ".digismith-depot"; PAYLOAD = DEPOT / "opencode/boot"
V2_BIN = HOME / ".opencode/bin/opencode"; V1_BIN = HOME / ".opencode/bin/opencode-1.18.35"
ap = argparse.ArgumentParser(description="Boot the shared OpenCode server (v2 with 1.18.35 fallback)")
ap.add_argument("--test", action="store_true", help="throwaway home and port, never the live port, no fallback")
ap.add_argument("--port"); ap.add_argument("--project"); ap.add_argument("--pass-file"); ap.add_argument("--log")
a = ap.parse_args()
live = not a.test
port = a.port or ("4198" if live else "4217")
if a.test and port == "4198": sys.exit("--test never uses the live port 4198")
OC = DEPOT / "opencode"; V2 = OC / ("v2" if live else "test")
proj = pathlib.Path(a.project or (PAYLOAD / "project").read_text().strip()).resolve()
pass_file = pathlib.Path(a.pass_file).expanduser() if a.pass_file else (OC / "server-password" if live else V2 / "pass")
log_file = pathlib.Path(a.log).expanduser() if a.log else (OC / "server.log" if live else V2 / "server.log")
verd = OC / "verdicts.jsonl" if live else V2 / "verdicts.jsonl"
pid_file = OC / "server.pid" if live else V2 / "server.pid"
now = lambda: time.strftime("%H:%M:%S")
def say(m): print(now(), m, flush=True)
if not PAYLOAD.exists(): sys.exit("payload missing: run scripts/opencode-boot/install.sh from the repo")
V2.mkdir(parents=True, exist_ok=True)
if not pass_file.exists():
    if live: sys.exit(f"password file missing: {pass_file}")
    import secrets; fd = os.open(pass_file, os.O_WRONLY | os.O_CREAT, 0o600); os.write(fd, secrets.token_hex(16).encode()); os.close(fd)
pw = pass_file.read_text().strip()
fd = os.open(log_file, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600); os.chmod(log_file, 0o600)

def install_home():
    """Fill the v2 home from the payload: plugin directories with pnpm deps, merged config."""
    for d in ("maestro", "prompts", "plugin-safety", "plugin-key", "xdg/c", "xdg/d", "xdg/s", "xdg/k"): (V2 / d).mkdir(parents=True, exist_ok=True)
    shutil.copytree(PAYLOAD / "prompts", V2 / "prompts", dirs_exist_ok=True)
    shutil.copy(PAYLOAD / "maestro-safety.js", V2 / "plugin-safety/maestro-safety.js"); shutil.copy(PAYLOAD / "maestro-safety-v2.js", V2 / "plugin-safety/server.js")
    shutil.copy(PAYLOAD / "tokenreply-key-v2.js", V2 / "plugin-key/server.js")
    for d in ("plugin-safety", "plugin-key"): (V2 / d / "package.json").write_text('{"type":"module"}\n')
    if not (V2 / "node_modules/@opencode/plugin").exists() or not (V2 / "node_modules/dotenv").exists():   # pnpm only; its ignored-build exit code is fine
        (V2 / "package.json").write_text('{"name":"opencode-v2-home","private":true}\n')
        subprocess.run(["pnpm", "add", "@opencode/plugin@2.0.26", "dotenv@16.4.5"], cwd=V2, capture_output=True, text=True, timeout=180)
    for d in ("plugin-safety", "plugin-key"):
        l = V2 / d / "node_modules"
        if not l.exists() and not l.is_symlink(): l.symlink_to("../node_modules")
    cfg = json.load(open(PAYLOAD / "opencode.json"))
    glob = json.load(open(HOME / ".config/opencode/opencode.json"))["provider"]["tokenreply"]   # 1.x global provider block: npm package and baseURL (its apiKey is an env reference, dropped)
    prov = cfg.setdefault("provider", {}).setdefault("tokenreply", {})
    prov["npm"] = glob["npm"]; prov["name"] = glob["name"]; prov["options"] = {"baseURL": glob["options"]["baseURL"]}
    cfg["plugin"] = [str(V2 / "plugin-key"), str(V2 / "plugin-safety")]
    (V2 / "maestro/opencode.json").write_text(json.dumps(cfg, indent=1))

def pids_on(p): return [int(x) for x in subprocess.run(["lsof", "-nP", f"-iTCP:{p}", "-sTCP:LISTEN", "-t"], capture_output=True, text=True).stdout.split()]
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
def req(path, method="GET", body=None, timeout=30):
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={"Authorization": "Basic " + base64.b64encode(("opencode:" + pw).encode()).decode(), "content-type": "application/json", "x-opencode-directory": str(proj)})
    return urllib.request.urlopen(r, timeout=timeout).status
def wait_loaded(label, before, secs):
    t = time.time()
    while time.time() - t < secs and loaded() <= before: time.sleep(1)
    ok = loaded() > before; say(f"{label}: safety plugin {'loaded' if ok else 'did NOT log loaded'}"); return ok
def base_env():
    e = {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(HOME), "OPENCODE_DISABLE_AUTOUPDATE": "1", "OPENCODE_SAFETY": "1", "SAFETY_ALLOWED_WS": os.environ.get("SAFETY_ALLOWED_WS", "w2"), "OPENCODE_SERVER_PASSWORD": pw}
    if not live: e["SAFETY_LOG"] = str(verd)
    return e
def spawn(binary, env, label):
    p = subprocess.Popen([str(binary), "serve", "--hostname", "127.0.0.1", "--port", port], cwd=proj, env=env, stdin=subprocess.DEVNULL, stdout=fd, stderr=fd, start_new_session=True)
    say(f"{label}: started pid {p.pid}"); return p
def listen_wait(p, label, secs):
    t = time.time()
    while time.time() - t < secs and not pids_on(port) and p.poll() is None: time.sleep(1)
    if pids_on(port): say(f"{label}: listening after {int(time.time()-t)} s"); return True
    say(f"{label}: NOT listening in {secs} s"); stop_pid(p.pid, 5); return False

def start_v2():
    install_home(); before = loaded()
    env = dict(base_env(), PATH=f"{V2_BIN.parent}:/usr/bin:/bin", XDG_CONFIG_HOME=str(V2/"xdg/c"), XDG_DATA_HOME=str(V2/"xdg/d"), XDG_STATE_HOME=str(V2/"xdg/s"), XDG_CACHE_HOME=str(V2/"xdg/k"),
              OPENCODE_CONFIG=str(V2/"maestro/opencode.json"))
    p = spawn(V2_BIN, env, "v2 2.0.26")
    if not listen_wait(p, "v2 2.0.26", 60): return None
    # 2.x loads server plugins lazily: a session request AND a plugin-list request for the project folder trigger it.
    for path, m, body in (("/api/session", "POST", {"location": {"directory": str(proj)}}), ("/api/plugin", "GET", None)):
        try: req(path, m, body)
        except Exception as e: say(f"v2: {path} request failed: {type(e).__name__}")
    if not wait_loaded("v2", before, 40): stop_pid(p.pid, 5); return None
    return p.pid
def start_v1():
    before = loaded()
    env = dict(base_env(), OPENCODE_CONFIG=str(PAYLOAD / "opencode.json"), PATH=f"{V1_BIN.parent}:/usr/bin:/bin")
    p = spawn(V1_BIN, env, "1.18.35")
    if not listen_wait(p, "1.18.35", 60): return None
    try: req(f"/session?directory={proj}", timeout=120)   # 1.x loads plugins lazily on the first request for a project folder
    except Exception as e: say(f"1.18.35: first request: {type(e).__name__}")
    if not wait_loaded("1.18.35", before, 20): stop_pid(p.pid, 5); return None
    return p.pid

t0 = time.time()
for pid in pids_on(port): say(f"stopping pid {pid} on port {port}"); stop_pid(pid)
if pids_on(port): sys.exit(f"port {port} still busy")
pid = start_v2(); which = "2.0.26"
if not pid and live:
    say("FALLBACK to 1.18.35"); pid = start_v1(); which = "1.18.35"
if not pid: say("RESULT FAILED: nothing serves with the safety plugin loaded"); sys.exit(1)
pid_file.write_text(str(pid)); os.chmod(pid_file, 0o600)
say(f"RESULT OpenCode {which} pid {pid} on 127.0.0.1:{port}, safety plugin loaded, downtime {int(time.time()-t0)} s")
