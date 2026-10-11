// DGS-401 free test (no model), DGS-408: repo-wide edits are now allowed (see test-dgs-408.mjs); write allow is path-exact (no .., symlinks resolved), the four dispatch verbs pass by rule, the six ask verbs still go to the reviewer, denies win.
// Usage: node test-dgs-401.mjs   (builds a temp root, reviewer pointed at a closed port, so every "review" case ends as a block "reviewer-down")
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "dgs401-")))
const R = join(tmp, "repo"), OUT = join(tmp, "outside")
for (const d of [".digismith/sessions/opencode-maestro/briefs", ".digismith/sessions/dgs-346", ".digismith/board/DGS-401—x/worker-dgs-401", ".digismith/board/DGS-401—x/other/deep", ".claude", "packages/cli", ".digismith/sessions/notdgs"]) mkdirSync(join(R, d), { recursive: true })
mkdirSync(OUT, { recursive: true })
symlinkSync(OUT, join(R, ".digismith/sessions/dgs-2"))                       // dgs-2 -> outside the root
symlinkSync(join(R, "packages"), join(R, ".digismith/board/DGS-9—link"))      // board folder -> a repo folder
symlinkSync(join(R, ".claude/settings.json"), join(R, ".digismith/sessions/dgs-346/link.md")) // file link inside an allowed folder
writeFileSync(join(R, ".claude/settings.json"), "{}")
symlinkSync(join(R, ".claude/settings.json"), join(R, ".digismith/sessions/dgs-3-brief-target"))
mkdirSync(join(R, ".digismith/sessions/dgs-3"), { recursive: true })
symlinkSync(join(R, ".claude/settings.json"), join(R, ".digismith/sessions/dgs-3/brief.md")) // brief.md itself a link to a repo file
symlinkSync(join(OUT, "new.txt"), join(R, ".digismith/board/DGS-401—x/dangling.md"))       // dangling link out of the root
symlinkSync(join(R, ".claude/hook.sh"), join(R, ".digismith/board/DGS-401—x/worker-dgs-401/d2.md")) // dangling link to a repo path
mkdirSync(join(R, ".digismith/sessions/dgs-5"), { recursive: true })
symlinkSync(join(OUT, "b.txt"), join(R, ".digismith/sessions/dgs-5/brief.md"))
process.env.OPENCODE_SAFETY = "1"; process.env.SAFETY_LOG = join(tmp, "v.jsonl"); process.env.SAFETY_REVIEWER_URL = "http://127.0.0.1:1"; process.env.SAFETY_ROOTS = R
const { MaestroSafety } = await import("./maestro-safety.js")
const H = join(homedir(), ".digismith-depot/bin/herdr-ws")
const hooks = await MaestroSafety({ directory: R, client: { session: { messages: async () => ({ data: [] }) } } })
const w = (p, tool = "write") => [tool, { filePath: p, content: "x" }]
const patch = (p) => ["patch", { patchText: `*** Begin Patch\n*** Add File: ${p}\n+x\n*** End Patch` }]
const S = ".digismith/sessions", B = ".digismith/board"
const cases = [
  // [id, [tool, args], expect "allow" | "block" | "block-review"]
  ["brief-dgs-346", w(`${R}/${S}/dgs-346/brief.md`), "allow"],
  ["brief-patch", patch(`${R}/${S}/dgs-346/brief.md`), "allow"],
  ["om-briefs-sub", patch(`${R}/${S}/opencode-maestro/briefs/dgs-346.md`), "allow"],
  ["om-flat", patch(`${R}/${S}/opencode-maestro/brief-dgs-346.md`), "allow"],
  ["board-direct", w(`${R}/${B}/DGS-401—x/plan.md`), "allow"],
  ["board-worker", w(`${R}/${B}/DGS-401—x/worker-dgs-401/plan.md`), "allow"],
  ["board-worker-om", w(`${R}/${B}/DGS-401—x/worker-opencode-maestro/deep/a.md`), "allow"],
  ["dgs-not-brief", w(`${R}/${S}/dgs-346/notes.md`), "allow"],
  ["brief-outside-dgs", w(`${R}/${S}/notdgs/brief.md`), "allow"],
  ["brief-in-sessions-root", w(`${R}/${S}/brief.md`), "allow"],
  ["dgs-nondigit", w(`${R}/${S}/dgs-x/brief.md`), "allow"],
  ["board-too-deep", w(`${R}/${B}/DGS-401—x/other/deep/a.md`), "allow"],
  ["board-nonworker-sub", w(`${R}/${B}/DGS-401—x/other/a.md`), "allow"],
  ["board-no-ticket", w(`${R}/${B}/a.md`), "allow"],
  ["trav-env", w(`${R}/${S}/dgs-1/../../../.env`), "block"],
  ["trav-settings", w(`${R}/${S}/dgs-346/../../../.claude/settings.json`), "block"],
  ["trav-board", w(`${R}/${B}/DGS-401—x/../../../packages/cli/x.ts`), "block"],
  ["trav-patch", patch(`${R}/${S}/dgs-346/../../../.claude/settings.json`), "block"],
  ["trav-rel", w(`${S}/dgs-346/../../../.claude/settings.json`), "block"],
  ["symlink-dir-out", w(`${R}/${S}/dgs-2/brief.md`), "block"],
  ["symlink-board-to-repo", w(`${R}/${B}/DGS-9—link/cli/x.md`), "allow"],
  ["symlink-file-in", w(`${R}/${S}/dgs-346/link.md`), "block"],
  ["symlink-brief-file", w(`${R}/${S}/dgs-3/brief.md`), "block"],
  ["dangling-out", w(`${R}/${B}/DGS-401—x/dangling.md`), "block"],
  ["dangling-repo", w(`${R}/${B}/DGS-401—x/worker-dgs-401/d2.md`), "block"],
  ["dangling-brief", w(`${R}/${S}/dgs-5/brief.md`), "block"],
  ["repo-claude", w(`${R}/.claude/settings.json`), "block"],
  ["repo-packages", w(`${R}/packages/cli/index.ts`), "allow"],
  ["repo-readme", w(`${R}/README.md`), "allow"],
  ["secret-in-allowed", w(`${R}/${S}/dgs-346/token-brief.md`), "block"],
  ["secret-env-board", w(`${R}/${B}/DGS-401—x/.env`), "block"],
  ["secret-password-board", w(`${R}/${B}/DGS-401—x/password.md`), "block"],
  ["secret-text", ["write", { filePath: `${R}/${S}/dgs-346/brief.md`, content: "key sk-abcdefghijklmnopqrstuvwx" }], "block"],
  ["delete-patch", ["patch", { patchText: `*** Begin Patch\n*** Delete File: ${R}/${S}/dgs-346/brief.md\n*** End Patch` }], "block"],
  ["move-out", ["patch", { patchText: `*** Begin Patch\n*** Update File: ${R}/${S}/dgs-346/brief.md\n*** Move to: ${R}/.claude/settings.json\n*** End Patch` }], "block"],
  ["write-no-path", ["write", { content: "x" }], "block"],
  // herdr: the four dispatch verbs pass by rule; the six ask verbs still go to the reviewer (down here = block); other workspace = block
  ["tab-create", ["bash", { command: `HERDR_WS=w2 ${H} tab create --workspace w2 --cwd ${R} --label dgs-346` }], "allow"],
  ["agent-start", ["bash", { command: `HERDR_WS=w2 ${H} agent start dgs-346 --workspace w2 --agent claude` }], "allow"],
  ["agent-prompt", ["bash", { command: `HERDR_WS=w2 ${H} agent prompt dgs-346 "Read brief and follow it."` }], "allow"],
  ["agent-prompt-plain", ["bash", { command: `HERDR_WS=w2 ${H} agent prompt dgs-346 Read-brief` }], "allow"],
  ["agent-wait", ["bash", { command: `HERDR_WS=w2 ${H} agent wait dgs-346 --status idle` }], "allow"],
  ["ws-dup-last", ["bash", { command: `HERDR_WS=w2 ${H} tab create x --workspace w2 --workspace w3` }], "block"],
  ["ws-dup-first", ["bash", { command: `HERDR_WS=w2 ${H} agent prompt p1 --workspace w3 --workspace w2` }], "block"],
  ["ws-short", ["bash", { command: `HERDR_WS=w2 ${H} tab create x -w w3 --workspace w2` }], "block"],
  ["ws-equals", ["bash", { command: `HERDR_WS=w2 ${H} tab create x --workspace=w3` }], "block"],
  ["ws-single-ok", ["bash", { command: `HERDR_WS=w2 ${H} tab create x --workspace w2` }], "allow"],
  ["pane-dup", ["bash", { command: `HERDR_WS=w2 ${H} agent start a --pane w2:p1 --pane w3:p1` }], "block"],
  ["tab-create-w3", ["bash", { command: `HERDR_WS=w3 ${H} tab create --label x` }], "block"],
  ["tab-create-flag-w3", ["bash", { command: `HERDR_WS=w2 ${H} tab create --workspace w3 --label x` }], "block"],
  ["pane-create-not-listed", ["bash", { command: `HERDR_WS=w2 ${H} pane create --label x` }], "block-review"],
  ["tab-close", ["bash", { command: `HERDR_WS=w2 ${H} tab close w2:t9` }], "block-review"],
  ["agent-stop", ["bash", { command: `HERDR_WS=w2 ${H} agent stop dgs-346` }], "block-review"],
  ["pane-run", ["bash", { command: `HERDR_WS=w2 ${H} pane run w2:p1 ls` }], "block-review"],
  ["agent-send", ["bash", { command: `HERDR_WS=w2 ${H} agent send dgs-346 hi` }], "block-review"],
  ["tab-rename", ["bash", { command: `HERDR_WS=w2 ${H} tab rename w2:t9 x` }], "block-review"],
  ["tab-focus", ["bash", { command: `HERDR_WS=w2 ${H} tab focus w2:t9` }], "block-review"],
  ["tab-create-meta", ["bash", { command: `HERDR_WS=w2 ${H} tab create --label $(id)` }], "block"],
  ["tab-create-secret", ["bash", { command: `HERDR_WS=w2 ${H} tab create --label token-x` }], "block"],
  ["herdr-list", ["bash", { command: `HERDR_WS=w2 ${H} agent list` }], "allow"],
  ["ls-etc", ["bash", { command: "ls /etc" }], "block"],
]
let fail = 0
for (const [id, [tool, args], expect] of cases) {
  let outcome, msg = ""
  try { await hooks["tool.execute.before"]({ tool, sessionID: "t", callID: id }, { args }); outcome = "allow" } catch (e) { outcome = "block"; msg = e.message }
  const viaReviewer = /reviewer-down/.test(msg)
  const ok = expect === "allow" ? outcome === "allow" : expect === "block" ? outcome === "block" && !viaReviewer : outcome === "block" && viaReviewer
  if (!ok) fail++
  console.log(ok ? "PASS" : "FAIL", id.padEnd(24), outcome, msg.slice(0, 90))
}
console.log(fail ? "FAILED " + fail : "ALL PASS", cases.length)
process.exit(fail ? 1 : 0)
