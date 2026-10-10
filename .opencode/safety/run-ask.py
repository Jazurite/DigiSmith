#!/usr/bin/env python3 -I
"""DGS-226 ask-prompt test: the maestro agent is asked to create a herdr tab (rule = ask). Shows the pending permission request (what Jack's client shows),
checks that nothing ran while it waits, then REJECTS it through the API (a throwaway server, no real tab is created). Usage: run-ask.py <port>"""
import json, os, sys, time, base64, urllib.request
port = sys.argv[1]
a = "Basic " + base64.b64encode(("opencode:" + os.environ["OPENCODE_SERVER_PASSWORD"]).encode()).decode()
def api(p, b=None):
    r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%s%s" % (port, p), data=None if b is None else json.dumps(b).encode(), headers={"Authorization": a, "content-type": "application/json"}), timeout=120)
    t = r.read(); return json.loads(t) if t else None
H = "/Users/workbox/.digismith-depot/bin/herdr-ws"
sid = api("/session", {})["id"]
api("/session/%s/prompt_async" % sid, {"agent": "maestro", "parts": [{"type": "text", "text": "Create a herdr tab labelled ask-test in workspace w2. Run exactly this command: HERDR_WS=w2 %s tab create --workspace w2 --label ask-test --no-focus" % H}]})
req = None
for _ in range(60):
    time.sleep(2)
    pend = [x for x in api("/permission") if x.get("sessionID") == sid]
    if pend: req = pend[0]; break
print("pending permission request:", json.dumps(req)[:600] if req else "NONE after 120 s")
if req:
    time.sleep(20)  # nothing may run while it waits
    ms = api("/session/%s/message" % sid)
    states = [(p["tool"], p["state"]["status"]) for x in ms for p in x["parts"] if p["type"] == "tool"]
    print("tool states while waiting:", states)
    api("/permission/%s/reply" % req["id"], {"reply": "reject"})
    time.sleep(10)
    ms = api("/session/%s/message" % sid)
    print("after reject:", [(p["tool"], p["state"]["status"]) for x in ms for p in x["parts"] if p["type"] == "tool"])
