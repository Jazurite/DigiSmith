#!/usr/bin/env python3 -I
"""Token and cost sum over all sessions of a throwaway server. Usage: cost.py <port> <passfile> <since-epoch-ms> [in out cache price per 1M]. Default luna $0.20/$1.20/$0.02.
Only sessions created after <since>: a throwaway server shares the live session store."""
import json, sys, base64, urllib.request
port, pf = sys.argv[1], sys.argv[2]; since = int(sys.argv[3]); pr = [float(x) for x in sys.argv[4:7]] or [0.20, 1.20, 0.02]
a = "Basic " + base64.b64encode(("opencode:" + open(pf).read().strip()).encode()).decode()
def api(p): return json.load(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%s%s" % (port, p), headers={"Authorization": a}), timeout=60))
t = [0, 0, 0]; n = 0
for s in api("/session"):
    if s["time"]["created"] < since: continue
    n += 1
    for m in api("/session/%s/message" % s["id"]):
        k = m["info"].get("tokens") or {}
        if m["info"]["role"] == "assistant": t[0] += k.get("input", 0); t[1] += k.get("output", 0); t[2] += (k.get("cache") or {}).get("read", 0)
print("sessions", n, "in/out/cacheR", t, "cost $%.4f" % (t[0] * pr[0] / 1e6 + t[1] * pr[1] / 1e6 + t[2] * pr[2] / 1e6))
