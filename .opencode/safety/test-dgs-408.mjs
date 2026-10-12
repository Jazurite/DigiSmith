// DGS-408 free test (no model): broad repo edits by rule, path classes denied (case-insensitive), Delete File / Move to and six herdr verbs are BLOCKED "needs Jack" by the plugin alone (hook present or absent: no difference).
// Usage: node test-dgs-408.mjs   (builds a temp root; reviewer URL dead; log in the temp dir, never the live log)
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "dgs408-")))
const R = join(tmp, "repo"), OUT = join(tmp, "outside")
for (const d of [".digismith/sessions/DigiSmith", ".digismith/sessions/dgs-404", ".digismith/board/DGS-408—x/worker-dgs-408", ".worktrees/dgs-408/packages/cli", ".worktrees/dgs-408/.git-not", "packages/cli", ".claude/hooks", ".claude/commands", ".claude/agents", ".git/hooks", "node_modules/x", ".github", "a/.git", ".opencode/safety", ".opencode/maestro", ".opencode/prompts", "scripts/opencode-boot", ".husky", ".githooks"]) mkdirSync(join(R, d), { recursive: true })
mkdirSync(OUT, { recursive: true })
writeFileSync(join(R, ".git/config"), "x"); writeFileSync(join(R, "README.md"), "x")
writeFileSync(join(R, "AGENTS.md"), "x")
symlinkSync(join(R, "AGENTS.md"), join(R, "agentslink.md"))   // file -> AGENTS.md
symlinkSync(join(R, ".opencode"), join(R, "oclink"))          // dir -> .opencode
symlinkSync(OUT, join(R, "linkdir"))                        // dir -> outside
symlinkSync(join(R, ".git"), join(R, "gitlink"))            // dir -> .git
symlinkSync(join(R, ".git/config"), join(R, "cfglink.md"))  // file -> .git file
symlinkSync(join(OUT, "nope"), join(R, "dangling.md"))      // dangling
process.env.OPENCODE_SAFETY = "1"; process.env.SAFETY_LOG = join(tmp, "v.jsonl"); process.env.SAFETY_REVIEWER_URL = "http://127.0.0.1:1"; process.env.SAFETY_ROOTS = R; process.env.SAFETY_MARK_TTL_MS = "300"
const { MaestroSafety } = await import("./maestro-safety.js")
const mk = (canAsk) => MaestroSafety({ directory: R, canAsk, client: { session: { messages: async () => ({ data: [] }) } } })
const withAsk = await mk(true), noAsk = await mk(false)
const A = (p) => `${R}/${p}`
const hunk = {
  add: (p) => `*** Add File: ${p}\n+x`, upd: (p) => `*** Update File: ${p}\n@@\n-a\n+b`, del: (p) => `*** Delete File: ${p}`,
  mv: (p, q) => `*** Update File: ${p}\n*** Move to: ${q}\n@@\n-a\n+b`,
}
const patch = (...h) => ["patch", { patchText: `*** Begin Patch\n${h.join("\n")}\n*** End Patch` }]
const raw = (t) => ["patch", { patchText: t }]
const w = (p, tool = "write") => [tool, tool === "edit" ? { filePath: p, oldString: "a", newString: "b" } : { filePath: p, content: "x" }]
const sess = (n) => "s" + n
let n = 0
// run before-hook then the evaluate hook the way the server would (rules said allow): returns "allow" | "ask" | "block:<msg>"
async function run(h, [tool, args], over = {}) {
  const id = "c" + ++n, sessionID = over.sessionID || sess(n)
  try { await h["tool.execute.before"]({ tool, sessionID, callID: id }, { args }) } catch (e) { return "block:" + e.message }
  const ev = { sessionID, action: over.action || (tool === "bash" ? "bash" : "edit"), resources: ["x"], source: { type: "tool", id: over.sourceId ?? id }, metadata: over.metadata, effect: "allow" }
  h["permission.evaluate"]?.(ev)
  return ev.effect
}
const cases = []
const ok = (id, call) => cases.push([id, call, "allow"])
const blk = (id, call, h = withAsk) => cases.push([id, call, "block", h])
// DGS-408c: the ask route is removed (it failed open live): every delete / move / listed herdr verb is BLOCKED "needs Jack" by the plugin alone, in BOTH hook states
const ask = (id, call) => { cases.push([id, call, "block-needs-jack", withAsk]); cases.push([id + "/nohook", call, "block-needs-jack", noAsk]) }
// ---- broad allow, three tool shapes
ok("repo-readme-patch", patch(hunk.upd(A("README.md"))))
ok("repo-readme-write", w(A("README.md")))
ok("repo-readme-edit", w(A("README.md"), "edit"))
ok("repo-readme-relative", patch(hunk.upd("README.md")))
ok("repo-dot-slash", patch(hunk.upd("./README.md")))
ok("worktree-path", patch(hunk.add(A(".worktrees/dgs-408/packages/cli/x.ts"))))
ok("order-file", patch(hunk.add(A(".digismith/sessions/DigiSmith/order-x.md"))))
ok("brief", patch(hunk.add(A(".digismith/sessions/dgs-404/brief.md"))))
ok("board-deep", patch(hunk.add(A(".digismith/board/DGS-408—x/worker-dgs-408/plan.md"))))
ok("packages", w(A("packages/cli/index.ts")))
ok("gitignore", w(A(".gitignore")))
ok("husky-allowed", w(A(".husky/pre-commit")))
ok("githooks-allowed", w(A(".githooks/x")))
ok("claude-commands-allowed", w(A(".claude/commands/x.md")))
ok("claude-agents-allowed", w(A(".claude/agents/x.md")))
ok("github-dir", w(A(".github/ci.yml")))
ok("dotgit-not-segment", w(A(".worktrees/dgs-408/.git-not/x")))
ok("env-example", w(A("x/.env.example")))
ok("multi-hunk-allowed", patch(hunk.add(A("a.md")), hunk.upd(A("README.md"))))
ok("content-marker-plus", raw(`*** Begin Patch\n*** Add File: ${A("n.md")}\n+*** Delete File: ${A("README.md")}\n+*** Move to: x\n*** End Patch`))
// ---- denied path classes (case-insensitive: macOS)
for (const [id, p] of Object.entries({
  env: ".env", ENV: ".ENV", Env2: "x/.Env", "env-local": ".env.local", pem: "k.pem", key: "my.key", rsa: "ID_RSA", ed: "id_ed25519", auth: "Auth.JSON", token: "a/token.md", TOKEN: "a/TOKEN.md", secret: "secret-x.md", cred: "credential.md", pw: "Password.txt",
  oc: "opencode.json", OC: "OPENCODE.JSON", ocdeep: "a/opencode.json", maestro: ".opencode/maestro/x.md", safety: ".opencode/safety/maestro-safety.js", SAFETY: ".OPENCODE/Safety/x.js",
  settings: ".claude/settings.json", settings2: ".claude/Settings.local.json", chooks: ".claude/hooks/x.sh", CHOOKS: ".CLAUDE/Hooks/x.sh",
  git: ".git/config", GIT: ".GIT/hooks/x", gitdeep: "a/.git/config", gitptr: ".worktrees/dgs-408/.git", nm: "node_modules/x/y.js", NM: "Node_Modules/x/y.js",
  ocplug: ".opencode/plugins/x.js", ocagent: ".opencode/agent/maestro.md", ocskill: ".opencode/skills/x/SKILL.md", OCUP: ".OPENCODE/x", ocroot: ".opencode/package.json", agents: "AGENTS.md", agentsub: "sub/AGENTS.md", agentslow: "agents.md", claude: "CLAUDE.md", claudedeep: "a/b/CLAUDE.md", claudecase: "Claude.MD", wtagents: ".worktrees/dgs-408/AGENTS.md", linkagents: "agentslink.md", linkoc: "oclink/plugins/x.js",
  boot: "scripts/opencode-boot/install.sh", prompts: ".opencode/prompts/maestro.md",
  "slash-oddity": ".//.git/x", "dbl-slash": "x//.git/x",
})) { blk("deny-" + id, patch(hunk.add(A(p)))); blk("denyw-" + id, w(A(p))) }
blk("outside-abs", patch(hunk.add("/tmp/dgs408-out.md")))
blk("depot", patch(hunk.add(`${process.env.HOME}/.digismith-depot/x.md`)))
blk("tilde", patch(hunk.add("~/.config/x")))
blk("trav", patch(hunk.add(A("a/../../x.md"))))
blk("trav-git", patch(hunk.add(A("packages/../.git/hooks/x"))))
blk("symlink-out", w(A("linkdir/x.md")))
blk("symlink-to-git", w(A("gitlink/hooks/x")))
blk("symlink-file-git", w(A("cfglink.md")))
blk("dangling", w(A("dangling.md")))
blk("secret-text", ["write", { filePath: A("n.md"), content: "k sk-abcdefghijklmnopqrstuvwx" }])
blk("no-path", ["write", { content: "x" }])
blk("denied-one-hunk-of-many", patch(hunk.add(A("ok.md")), hunk.add(A(".git/hooks/x"))))
// ---- multiedit: EVERY path inside it is checked (top-level and each edits[] entry); an unparsable entry blocks (fail closed)
const me = (top, edits) => ["multiedit", { filePath: top, edits }]
const e1 = (f, k = "filePath") => ({ [k]: f, oldString: "a", newString: "b" })
ok("multiedit-all-allowed", me(A("README.md"), [e1(A("README.md")), e1(A("packages/cli/x.ts"))]))
ok("multiedit-no-nested-path", me(A("README.md"), [{ oldString: "a", newString: "b" }]))
blk("multiedit-nested-denied", me(A("README.md"), [e1(A("README.md")), e1(A(".opencode/safety/maestro-safety.js"))]))
blk("multiedit-nested-path-key", me(A("README.md"), [e1(A(".git/hooks/x"), "path")]))
blk("multiedit-nested-agents", me(A("README.md"), [e1(A("AGENTS.md"))]))
blk("multiedit-nested-outside", me(A("README.md"), [e1("/tmp/x.md")]))
blk("multiedit-nested-trav", me(A("README.md"), [e1(A("a/../../x.md"))]))
blk("multiedit-nested-symlink", me(A("README.md"), [e1(A("linkdir/x.md"))]))
blk("multiedit-entry-not-object", me(A("README.md"), ["x"]))
blk("multiedit-path-not-string", me(A("README.md"), [{ filePath: { a: 1 }, oldString: "a", newString: "b" }]))
blk("multiedit-files-key", ["multiedit", { files: [{ path: A(".env"), edits: [] }] }])
blk("multiedit-top-denied", me(A(".env"), [e1(A("README.md"))]))
// ---- delete / move: ask when the hook is present
ask("delete-allowed", patch(hunk.del(A("README.md"))))
ask("delete-brief", patch(hunk.del(A(".digismith/sessions/dgs-404/brief.md"))))
ask("delete-relative", patch(hunk.del("README.md")))
ask("move-allowed-to-allowed", patch(hunk.mv(A("README.md"), A("packages/README2.md"))))
ask("update-with-move", patch(hunk.mv(A("packages/cli/index.ts"), A("packages/cli/main.ts"))))
ask("mixed-add-delete", patch(hunk.add(A("new.md")), hunk.del(A("README.md"))))
ask("mixed-delete-first", patch(hunk.del(A("README.md")), hunk.add(A("new.md"))))
ask("delete-lowercase", raw(`*** Begin Patch\n*** delete file: ${A("README.md")}\n*** End Patch`))
ask("delete-uppercase", raw(`*** Begin Patch\n*** DELETE FILE: ${A("README.md")}\n*** End Patch`))
ask("delete-leading-space", raw(`*** Begin Patch\n  *** Delete File: ${A("README.md")}\n*** End Patch`))
ask("delete-leading-tab", raw(`*** Begin Patch\n\t*** Delete File: ${A("README.md")}\n*** End Patch`))
ask("delete-trailing-space", raw(`*** Begin Patch\n*** Delete File: ${A("README.md")}   \n*** End Patch`))
ask("delete-crlf", raw(`*** Begin Patch\r\n*** Delete File: ${A("README.md")}\r\n*** End Patch\r\n`))
ask("delete-nospace", raw(`*** Begin Patch\n***Delete File:${A("README.md")}\n*** End Patch`))
ask("delete-wide-space", raw(`*** Begin Patch\n***   Delete   File:   ${A("README.md")}\n*** End Patch`))
ask("move-lowercase", raw(`*** Begin Patch\n*** Update File: ${A("README.md")}\n*** move to: ${A("packages/r.md")}\n*** End Patch`))
ask("move-leading-space", raw(`*** Begin Patch\n*** Update File: ${A("README.md")}\n   *** Move to: ${A("packages/r.md")}\n*** End Patch`))
ask("context-line-marker", raw(`*** Begin Patch\n*** Update File: ${A("README.md")}\n@@\n *** Delete File: ${A("x.md")}\n-a\n+b\n*** End Patch`))
ask("delete-apply_patch-tool", ["apply_patch", { patchText: `*** Begin Patch\n*** Delete File: ${A("README.md")}\n*** End Patch` }])
ask("odd-leading-space-add-hidden-delete", raw(`*** Begin Patch\n*** Add File: ${A("a.md")}\n+x\n *** Delete File: ${A("README.md")}\n*** End Patch`))
// ---- delete / move on a denied path or to a denied target: always block
ask("delete-env", patch(hunk.del(A(".env"))))
ask("delete-git", patch(hunk.del(A(".git/config"))))
ask("delete-self-config", patch(hunk.del(A(".opencode/maestro/opencode.json"))))
ask("delete-outside", patch(hunk.del("/tmp/x.md")))
ask("move-to-git", patch(hunk.mv(A("README.md"), A(".git/hooks/x"))))
ask("move-from-git", patch(hunk.mv(A(".git/config"), A("README.md"))))
ask("delete-lower-env", raw(`*** Begin Patch\n*** delete file: ${A(".env")}\n*** End Patch`))
// ---- no hook registered: every delete / move is blocked "needs Jack"
for (const [id, c] of [["delete", patch(hunk.del(A("README.md")))], ["move", patch(hunk.mv(A("README.md"), A("packages/r.md")))], ["mixed", patch(hunk.add(A("new.md")), hunk.del(A("README.md")))], ["lower", raw(`*** Begin Patch\n*** delete file: ${A("README.md")}\n*** End Patch`)], ["space", raw(`*** Begin Patch\n  *** Delete File: ${A("README.md")}\n*** End Patch`)]])
  cases.push(["noask-" + id, c, "block-needs-jack", noAsk])
cases.push(["noask-plain-edit-still-ok", patch(hunk.upd(A("README.md"))), "allow", noAsk])
// ---- the six reviewed herdr verbs skip the reviewer (URL is dead: "reviewer-down" would show) and go to Jack's prompt; no hook = block "needs Jack"
const HW = `HERDR_WS=w2 ${process.env.HOME}/.digismith-depot/bin/herdr-ws`
const six = { "tab-close": "tab close w2:t9", "agent-stop": "agent stop dgs-346", "pane-run": "pane run w2:p1 ls", "agent-send": "agent send dgs-346 hi", "tab-rename": "tab rename w2:t9 x", "tab-focus": "tab focus w2:t9" }
for (const [id, c] of Object.entries(six)) {
  ask("six-" + id, ["bash", { command: `${HW} ${c}` }])
  cases.push(["six-noask-" + id, ["bash", { command: `${HW} ${c}` }], "block-needs-jack", noAsk])
  blk("six-w3-" + id, ["bash", { command: `HERDR_WS=w3 ${process.env.HOME}/.digismith-depot/bin/herdr-ws ${c}` }])
  blk("six-pipe-" + id, ["bash", { command: `${HW} ${c} | cat` }])
  blk("six-semicolon-" + id, ["bash", { command: `${HW} ${c} ; ls` }])
  blk("six-redirect-" + id, ["bash", { command: `${HW} ${c} > x` }])
  blk("six-ws-flag-" + id, ["bash", { command: `${HW} ${c} --workspace w3` }])
  blk("six-ws-dup-" + id, ["bash", { command: `${HW} ${c} --workspace w2 --workspace w3` }])
  blk("six-pane-dup-" + id, ["bash", { command: `${HW} ${c} --pane w2:p1 --pane w3:p1` }])
  blk("six-bare-herdr-" + id, ["bash", { command: `herdr ${c}` }])
}
ask("six-tab1-close", ["bash", { command: `${HW} tab close w2:t1` }])
ask("six-tab1-close-flag", ["bash", { command: `${HW} tab close --workspace w2 w2:t1` }])
cases.push(["other-write-verb-still-reviewer", ["bash", { command: `${HW} pane create --label x` }], "block-reviewer", withAsk])
cases.push(["dispatch-verb-still-by-rule", ["bash", { command: `${HW} tab create --workspace w2 --label x` }], "allow", noAsk])
let fail = 0
const report = (id, ok2, got) => { if (!ok2) fail++; console.log(ok2 ? "PASS" : "FAIL", id.padEnd(34), String(got).slice(0, 90)) }
for (const [id, call, expect, h = withAsk] of cases) {
  const got = await run(h, call)
  const good = expect === "allow" ? got === "allow" : expect === "ask" ? got === "ask" : expect === "block" ? got.startsWith("block:") && !/needs Jack/.test(got) && !/reviewer-down/.test(got) : expect === "block-reviewer" ? /reviewer-down/.test(got) : got.startsWith("block:") && /needs Jack/.test(got)
  report(id, good, got)
}
console.log(fail ? "FAILED " + fail : "ALL PASS")
process.exit(fail ? 1 : 0)
