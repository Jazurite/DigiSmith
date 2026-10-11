// DGS-401 free test: effective permission of agent maestro and maestro-review in .opencode/maestro/opencode.json, OpenCode rule: the LAST matching rule wins; "*" matches any text.
// Where a call is decided: the plugin (maestro-safety.js) throws = blocked, whatever the config says; the config then asks/denies. A plugin allow never grants; a config deny never gets overridden.
import { readFileSync } from "node:fs"
const cfg = JSON.parse(readFileSync(new URL("../maestro/opencode.json", import.meta.url), "utf8"))
// Copy of OpenCode 2.0.26's own matcher (binary, function l$) and rule pick (FS = findLast; no match = ask): `\` becomes `/`, `*` = `.*` (crosses `/`), `?` = one char, a trailing " *" is optional, whole string, flag s.
const l$ = (e, r) => { const n = e.replaceAll("\\", "/"); let i = r.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."); if (i.endsWith(" .*")) i = i.slice(0, -3) + "( .*)?"; return new RegExp("^" + i + "$", "s").test(n) }
const decide = (rules, s) => { let r = "ask"; for (const [g, v] of Object.entries(rules)) if (l$(s, g)) r = v; return r }
const H = "HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws"
const cases = [
  ["edit", ".digismith/sessions/dgs-404/brief.md", "allow"],
  ["edit", ".digismith/sessions/dgs-346/brief.md", "allow"],
  ["edit", ".digismith/sessions/DigiSmith/order-x.md", "allow"],
  ["edit", ".digismith/board/DGS-401—x/worker-dgs-401/plan.md", "allow"],
  ["edit", ".digismith/sessions/opencode-maestro/briefs/dgs-346.md", "allow"],
  ["edit", "README.md", "allow"],
  ["edit", "packages/cli/x.ts", "allow"],
  ["edit", ".worktrees/dgs-408/packages/cli/x.ts", "allow"],
  ["edit", ".gitignore", "allow"],
  ["edit", ".github/ci.yml", "allow"],
  ["edit", ".husky/pre-commit", "allow"],
  ["edit", ".githooks/x", "allow"],
  ["edit", ".claude/commands/x.md", "allow"],
  ["edit", ".claude/agents/x.md", "allow"],
  ["edit", "x/.env.example", "allow"],
  ["edit", ".env", "deny"],
  ["edit", "a/.env.local", "deny"],
  ["edit", "k.pem", "deny"],
  ["edit", "my.key", "deny"],
  ["edit", "id_rsa", "deny"],
  ["edit", "a/id_ed25519", "deny"],
  ["edit", "auth.json", "deny"],
  ["edit", "a/token.md", "deny"],
  ["edit", "secret-x.md", "deny"],
  ["edit", "credential.md", "deny"],
  ["edit", "password.txt", "deny"],
  ["edit", "opencode.json", "deny"],
  ["edit", "a/opencode.json", "deny"],
  ["edit", ".opencode/maestro/opencode.json", "deny"],
  ["edit", ".opencode/safety/maestro-safety.js", "deny"],
  ["edit", ".opencode/prompts/maestro.md", "deny"],
  ["edit", ".worktrees/x/.opencode/safety/y.js", "deny"],
  ["edit", ".claude/settings.json", "deny"],
  ["edit", ".claude/settings.local.json", "deny"],
  ["edit", ".claude/hooks/x.sh", "deny"],
  ["edit", ".worktrees/x/.claude/settings.json", "deny"],
  ["edit", "scripts/opencode-boot/install.sh", "deny"],
  ["edit", ".git", "deny"],
  ["edit", ".git/config", "deny"],
  ["edit", ".git/hooks/pre-commit", "deny"],
  ["edit", "a/.git/config", "deny"],
  ["edit", ".worktrees/dgs-408/.git", "deny"],
  ["edit", "node_modules/x/y.js", "deny"],
  ["edit", "a/node_modules/x/y.js", "deny"],
  ["edit", "/Users/workbox/.digismith-depot/x.md", "deny"],
  ["edit", "/etc/hosts", "deny"],
  ["edit", "../x.md", "deny"],
  ["edit", "token.env.example", "deny"],
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
