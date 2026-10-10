#!/usr/bin/env python3 -I
"""DGS-169 pilot: the same three read-only asks to agent maestro (luna) and maestro-review (sonnet), fresh session per ask.
Usage: run_pilot.py <port> <agent,agent>. Needs OPENCODE_SERVER_PASSWORD. Prints per ask: seconds, tools, tokens, text."""
import json, os, sys, time, base64, urllib.request
port = sys.argv[1]; agents = sys.argv[2].split(",")
a = "Basic " + base64.b64encode(("opencode:" + os.environ["OPENCODE_SERVER_PASSWORD"]).encode()).decode()
def api(p, b=None):
    r = urllib.request.Request("http://127.0.0.1:%s%s" % (port, p), data=None if b is None else json.dumps(b).encode(), headers={"Authorization": a, "content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=300))
R = "/Users/workbox/Workspace/Jazurite/DigiSmith"
ASKS = [
 ("A1 status", "PILOT A1. Read the maestro note (%s/.digismith/sessions/DigiSmith/note.md) and give a status in a short table: done, in progress, blocked, needs Jack. Start nothing. Max 15 lines." % R),
 ("A2 agents", "PILOT A2. List the live agents in your herdr workspace with their status, one line each. Start nothing."),
 ("A3 brief", "PILOT A3. Draft a brief for the small backlog item %s/backlog/herdr-read-dim-prompt-suggestions.md: goal, files to read, rules, checkpoints. Max 14 lines. Write it to %s/.digismith/sessions/opencode-maestro/brief-draft-AGENT.md. Do not dispatch anything." % (R, R)),
]
for ag in agents:
    for name, text in ASKS:
        sid = api("/session", {})["id"]; t0 = time.time()
        m = api("/session/%s/message" % sid, {"agent": ag, "parts": [{"type": "text", "text": text.replace("AGENT", ag)}]})
        ms = api("/session/%s/message" % sid); tk = [0, 0, 0, 0]; tools = []; txt = ""
        for x in ms:
            if x["info"]["role"] != "assistant": continue
            t = x["info"].get("tokens") or {}
            tk[0] += t.get("input", 0); tk[1] += t.get("output", 0); tk[2] += (t.get("cache") or {}).get("read", 0); tk[3] += (t.get("cache") or {}).get("write", 0)
            for p in x["parts"]:
                if p["type"] == "tool": tools.append((p["tool"], p["state"]["status"]))
                if p["type"] == "text": txt = p["text"]
        print("=== %s | %s | %ds | tools=%s | tokens[in,out,cacheR,cacheW]=%s" % (ag, name, time.time() - t0, tools, tk))
        print(txt[:1400]); print(flush=True)
