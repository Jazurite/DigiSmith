#!/usr/bin/env python3 -I
"""DGS-334 throwaway OpenCode 2.x server, isolated from the live 1.x server: own XDG folders, own password file (never on the command line), own log, port guard.
Usage: serve-oc2.py <channel-folder> <port> [reviewer-url]   channel-folder is under ~/.digismith-depot/opencode2-test/ (pnpm install of @opencode/cli there).
Needs ~/.digismith-depot/opencode2-test/home/ with maestro/opencode.json, prompts, plugins and pass. Stop by PID (home/server.pid). The 2.x server prints its password
at start: the log is mode 600 and must not be shown."""
import os, pathlib, secrets, subprocess, sys
ch, port = sys.argv[1], sys.argv[2]
if int(port) < 4214 or port == "4198": sys.exit("throwaway ports start at 4214")
T = pathlib.Path.home() / ".digismith-depot/opencode2-test"; H = T / "home"; X = T / ch / "xdg"
for d in "cwd", "c", "d", "s", "k": (X / d).mkdir(parents=True, exist_ok=True)
pw = H / "pass"
if not pw.exists():
    fd = os.open(pw, os.O_WRONLY | os.O_CREAT, 0o600); os.write(fd, secrets.token_hex(16).encode()); os.close(fd)
env = {"PATH": f"{T}/{ch}/node_modules/.bin:/usr/bin:/bin", "HOME": str(pathlib.Path.home()), "XDG_CONFIG_HOME": str(X/"c"), "XDG_DATA_HOME": str(X/"d"), "XDG_STATE_HOME": str(X/"s"),
       "XDG_CACHE_HOME": str(X/"k"), "OPENCODE_DISABLE_AUTOUPDATE": "1", "OPENCODE_CONFIG": str(H/"maestro/opencode.json"), "OPENCODE_SAFETY": "1",
       "OPENCODE_SERVER_PASSWORD": pw.read_text(), "SAFETY_LOG": str(H/"logs/verdicts.jsonl"), "SAFETY_ALLOWED_WS": "w2"}
if os.environ.get("SAFETY_V2_SEEN"): env["SAFETY_V2_SEEN"] = os.environ["SAFETY_V2_SEEN"]
if len(sys.argv) > 3: env["SAFETY_REVIEWER_URL"] = sys.argv[3]
log = H / "logs/server.log"; log.parent.mkdir(exist_ok=True); fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
p = subprocess.Popen([str(T/ch/"node_modules/.bin/opencode2"), "serve", "--hostname", "127.0.0.1", "--port", port], cwd=X/"cwd", env=env,
                     stdin=subprocess.DEVNULL, stdout=fd, stderr=fd, start_new_session=True)
(H/"server.pid").write_text(str(p.pid)); print("pid", p.pid)
