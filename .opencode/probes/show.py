#!/usr/bin/env python3 -I
"""Show sessions whose first user text contains a marker: agent, model, tool calls, tokens, final text. Usage: show.py <port> <marker> [maxchars]
Needs OPENCODE_SERVER_PASSWORD. Prints token sums per model so cost can be computed at list price."""
import json, os, sys, base64, urllib.request
port, mark = sys.argv[1], sys.argv[2]; mx = int(sys.argv[3]) if len(sys.argv) > 3 else 1800
a = "Basic " + base64.b64encode(("opencode:" + os.environ["OPENCODE_SERVER_PASSWORD"]).encode()).decode()
def g(p): return json.load(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%s%s" % (port, p), headers={"Authorization": a}), timeout=60))
for s in g("/session"):
    ms = g("/session/%s/message" % s["id"])
    first = next((p.get("text", "") for m in ms if m["info"]["role"] == "user" for p in m["parts"] if p["type"] == "text"), "")
    if mark not in first: continue
    T = {}
    print("SESSION", s["id"])
    for m in ms:
        i = m["info"]
        if i["role"] != "assistant": continue
        t = i.get("tokens") or {}; k = i.get("modelID"); d = T.setdefault(k, [0, 0, 0, 0])
        d[0] += t.get("input", 0); d[1] += t.get("output", 0); d[2] += (t.get("cache") or {}).get("read", 0); d[3] += (t.get("cache") or {}).get("write", 0)
        for p in m["parts"]:
            if p["type"] == "tool": print("  TOOL", p["tool"], p["state"]["status"], json.dumps(p["state"].get("input"))[:100])
            if p["type"] == "text": print("  TEXT", p["text"][:mx])
    print("  TOKENS [in,out,cacheR,cacheW] by model:", T)
