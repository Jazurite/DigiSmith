// DGS-401 free test: effective permission of agent maestro and maestro-review in .opencode/maestro/opencode.json, OpenCode rule: the LAST matching rule wins; "*" matches any text.
// Where a call is decided: the plugin (maestro-safety.js) throws = blocked, whatever the config says; the config then asks/denies. A plugin allow never grants; a config deny never gets overridden.
import { readFileSync } from "node:fs"
const cfg = JSON.parse(readFileSync(new URL("../maestro/opencode.json", import.meta.url), "utf8"))
const re = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, ".").replace(/\*/g, ".*") + "$", "s")
const decide = (rules, s) => { let r; for (const [g, v] of Object.entries(rules)) if (re(g).test(s)) r = v; return r }
const R = "/Users/workbox/Workspace/Jazurite/DigiSmith", H = "HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws"
const cases = [
  ["edit", `${R}/.digismith/sessions/dgs-346/brief.md`, "allow"],
  ["edit", `${R}/.digismith/board/DGS-401—x/worker-dgs-401/plan.md`, "allow"],
  ["edit", `${R}/.digismith/sessions/opencode-maestro/briefs/dgs-346.md`, "allow"],
  ["edit", `${R}/.digismith/sessions/opencode-maestro/brief-dgs-346.md`, "allow"],
  ["edit", `${R}/.claude/settings.json`, "deny"],
  ["edit", `${R}/packages/cli/x.ts`, "deny"],
  ["edit", `${R}/.digismith/sessions/notdgs/brief.md`, "deny"],
  ["edit", `${R}/.digismith/sessions/dgs-346/notes.md`, "deny"],
  ["bash", `${H} tab create --workspace w2 --label x`, "allow"],
  ["bash", `${H} agent start dgs-1 --workspace w2`, "allow"],
  ["bash", `${H} agent prompt dgs-1 "Read it"`, "allow"],
  ["bash", `${H} agent wait dgs-1 --status idle`, "allow"],
  ["bash", `${H} tab close w2:t9`, "ask"],
  ["bash", `${H} agent stop dgs-1`, "ask"],
  ["bash", `${H} pane run w2:p1 ls`, "ask"],
  ["bash", `${H} agent send dgs-1 hi`, "ask"],
  ["bash", `${H} tab rename w2:t9 x`, "ask"],
  ["bash", `${H} tab focus w2:t9`, "ask"],
  ["bash", `${H} pane create --label x`, "ask"],               // not a dispatch verb pair: stays ask
  ["bash", `${H} agent list`, "allow"],
  ["bash", `${H} tab create --label $(id)`, "deny"],           // deny block comes later: wins over the allow
  ["bash", `${H} tab create --label x | cat`, "deny"],
  ["bash", `${H} agent prompt dgs-1 read-token`, "deny"],
  ["bash", `${H} agent start dgs-1 ; ls`, "deny"],
  ["bash", `HERDR_WS=w3 ${H.slice(14)} tab create x`, "deny"],
  ["bash", "rm -rf x", "deny"],
  ["bash", "ls /etc", "allow"],                                  // config allows ls; the plugin blocks outside the roots
]
let fail = 0
for (const agent of ["maestro", "maestro-review"]) for (const [perm, s, want] of cases) {
  const got = decide(cfg.agent[agent].permission[perm], s)
  if (got !== want) fail++
  console.log(got === want ? "PASS" : "FAIL", agent.padEnd(15), perm.padEnd(5), got, s.slice(0, 80))
}
for (const agent of ["maestro", "maestro-review"]) {   // other tools unchanged
  const p = cfg.agent[agent].permission
  if (decide(p.read, "/x/.env") !== "deny" || p.grep !== "deny" || p.task !== "deny") { fail++; console.log("FAIL other tools", agent) }
}
console.log(fail ? "FAILED " + fail : "ALL PASS")
process.exit(fail ? 1 : 0)
