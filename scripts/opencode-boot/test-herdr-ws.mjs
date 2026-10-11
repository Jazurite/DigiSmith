// DGS-408 free test (read-only herdr calls): herdr-ws must find the herdr socket under the OpenCode server's XDG env, and refuse what it always refused.
// Usage: node test-herdr-ws.mjs [path-to-herdr-ws]   (default: the copy next to this file)
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
const W = process.argv[2] || new URL("./herdr-ws", import.meta.url).pathname
const V = homedir() + "/.digismith-depot/opencode/v2/xdg"
const base = { PATH: "/usr/bin:/bin", HOME: homedir() }
const serverEnv = { ...base, XDG_CONFIG_HOME: V + "/c", XDG_DATA_HOME: V + "/d", XDG_STATE_HOME: V + "/s", XDG_CACHE_HOME: V + "/k" }
const run = (env, args) => spawnSync("python3", [W, ...args], { env, encoding: "utf8" })
let fail = 0
const check = (id, ok, extra = "") => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", id.padEnd(34), extra.slice(0, 80)) }
for (const [label, env] of [["normal-env", { ...base, HERDR_WS: "w2" }], ["server-env", { ...serverEnv, HERDR_WS: "w2" }]]) {
  let r = run(env, ["agent", "list"]); check(`${label}: agent list answers`, r.status === 0 && /"result"/.test(r.stdout) && !/server_not_running/.test(r.stdout), r.stdout)
  r = run(env, ["tab", "list"]); check(`${label}: tab list answers`, r.status === 0 && /"result"/.test(r.stdout) && !/server_not_running/.test(r.stdout), r.stdout)
}
const refused = (id, env, args) => { const r = run(env, args); check(id, r.status === 3 && /herdr-ws: refused/.test(r.stderr), r.stderr.trim()) }
for (const [label, env] of [["normal-env", base], ["server-env", serverEnv]]) {
  refused(`${label}: HERDR_WS unset`, env, ["agent", "list"])
  refused(`${label}: group not allowed`, { ...env, HERDR_WS: "w2" }, ["session", "list"])
  refused(`${label}: target in w3`, { ...env, HERDR_WS: "w2" }, ["pane", "read", "w3:p1"])
  refused(`${label}: create other ws`, { ...env, HERDR_WS: "w2" }, ["tab", "create", "--workspace", "w3"])
  refused(`${label}: tab 1 close`, { ...env, HERDR_WS: "w2" }, ["tab", "close", "w2:t1"])
}
console.log(fail ? "FAILED " + fail : "ALL PASS")
process.exit(fail ? 1 : 0)
