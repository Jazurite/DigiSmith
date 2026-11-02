import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SOURCE = path.join(__dirname, "herdr-ws")

const FAKE = `#!/bin/sh
# argv: --session S <group> <verb> ...
echo "$@" >> "$FAKE_LOG"
echo "\${HERDR_SOCKET_PATH-unset}" >> "$FAKE_LOG.env"
S="$2"; shift 2
case "$1 $2" in
  "agent list") echo '{"result":{"agents":[{"name":"dgs-1","pane_id":"w2:p1","workspace_id":"w2"},{"name":"dgs-2","pane_id":"w3:p1","workspace_id":"w3"},{"name":"dgs-683-b","pane_id":"w3:p2","workspace_id":"w3"},{"name":"tc-dgs-9","pane_id":"w7:p2","workspace_id":"w7"},{"name":"digismith-conductor","pane_id":"w7:p1","workspace_id":"w7"},{"name":"tc-dgs-8","pane_id":"w7:p6","workspace_id":"w7"},{"name":"scout-a","pane_id":"w3:p3","workspace_id":"w3"}]}}' ;;
  "agent get") case "$3" in dgs-1) W=w2;; dgs-2) W=w3;; dgs-683-b|scout-a) W=w3;; tc-dgs-9|digismith-conductor) W=w7;; esac; echo "{\\"result\\":{\\"agent\\":{\\"name\\":\\"$3\\",\\"workspace_id\\":\\"$W\\"}}}" ;;
  "tab get") if [ "$3" = "w7:t9" ]; then echo "not json"; exit 0; fi; case "$3" in w7:t2) L=tc-dgs-9;; w7:t3) L=nw-5;; *) L=digismith-conductor;; esac; echo "{\\"result\\":{\\"tab\\":{\\"tab_id\\":\\"$3\\",\\"label\\":\\"$L\\"}}}" ;;
  "tab list") echo "{\\"id\\":\\"cli:tab:list\\",\\"result\\":{\\"tabs\\":[{\\"tab_id\\":\\"$4:t1\\",\\"workspace_id\\":\\"$4\\"}]}}" ;;
  *) echo '{"result":{}}' ;;
esac
`

let dir: string
let copy: string
let log: string

type R = { status: number | null; stdout: string; stderr: string; log: string; env: string }

function run(env: Record<string, string>, args: string[]): R {
  fs.writeFileSync(log, "")
  fs.writeFileSync(log + ".env", "")
  const r = spawnSync("python3", [copy, ...args], {
    env: { PATH: "/usr/bin:/bin", FAKE_LOG: log, ...env },
    encoding: "utf8",
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, log: fs.readFileSync(log, "utf8"), env: fs.readFileSync(log + ".env", "utf8") }
}
const ok = (r: R) => r.status === 0
const refused = (r: R) => r.status === 3 && /herdr-ws: refused/.test(r.stderr)
const names = (r: R) => (JSON.parse(r.stdout).result.agents as { name: string }[]).map((x) => x.name)

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-ws-"))
  const fake = path.join(dir, "herdr")
  fs.writeFileSync(fake, FAKE, { mode: 0o755 })
  log = path.join(dir, "fake.log")
  copy = path.join(dir, "herdr-ws")
  const text = fs.readFileSync(SOURCE, "utf8")
  fs.writeFileSync(copy, text.replace('"/Users/workbox/.local/bin/herdr"', JSON.stringify(fake)))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe("herdr-ws scope parsing and --session (T10)", () => {
  it("HERDR_WS alone behaves as before: only w2 agents, session default", () => {
    const r = run({ HERDR_WS: "w2" }, ["agent", "list"])
    expect(ok(r)).toBe(true)
    expect(names(r)).toEqual(["dgs-1"])
    expect(r.log).toMatch(/^--session default agent list/)
  })

  it("neither HERDR_SCOPE nor HERDR_WS is refused", () => {
    const r = run({}, ["agent", "list"])
    expect(refused(r)).toBe(true)
    expect(r.stderr).toMatch(/HERDR_SCOPE or HERDR_WS not set/)
  })

  it("HERDR_WS alone refuses --session Castle", () => {
    expect(refused(run({ HERDR_WS: "w2" }, ["--session", "Castle", "agent", "list"]))).toBe(true)
  })

  it("scope with several default pairs: default list shows only default workspaces, Castle list only w7", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2,default:w3" }
    expect(names(run(env, ["agent", "list"])).sort()).toEqual(["dgs-1", "dgs-2", "dgs-683-b", "scout-a"])
    expect(names(run(env, ["--session", "Castle", "agent", "list"])).sort()).toEqual(["digismith-conductor", "tc-dgs-8", "tc-dgs-9"])
  })

  it("a session outside the scope is refused", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2" }
    expect(refused(run(env, ["--session", "other", "agent", "list"]))).toBe(true)
  })

  it("a scope without default refuses a call with no --session", () => {
    expect(refused(run({ HERDR_SCOPE: "Castle:w7" }, ["agent", "list"]))).toBe(true)
  })

  it("a second --session or any --socket later in argv is refused", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(refused(run(env, ["tab", "create", "--session", "x", "--workspace", "w2"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w2", "--session=x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w2", "--socket", "/tmp/s"]))).toBe(true)
    expect(refused(run(env, ["--session", "default", "--session", "Castle", "agent", "list"]))).toBe(true)
  })

  it("a target outside the scope is refused (pane read w4:p1 with w2,w3)", () => {
    expect(refused(run({ HERDR_SCOPE: "default:w2,default:w3" }, ["pane", "read", "w4:p1"]))).toBe(true)
  })

  it("every default pair is reachable; a default workspace outside the scope is not", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2,default:w3" }
    expect(ok(run(env, ["pane", "read", "w2:p1"]))).toBe(true)
    expect(ok(run(env, ["pane", "read", "w3:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w4:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w7:p1"]))).toBe(true) // w7 is a Castle workspace, not a default one
  })

  it("the same workspace id in Castle is not accepted through a default pair", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2" }
    expect(ok(run(env, ["--session", "Castle", "pane", "read", "w7:p1"]))).toBe(true)
    expect(refused(run(env, ["--session", "Castle", "pane", "read", "w2:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w7:p1"]))).toBe(true)
  })

  it("agent name targets are resolved in the chosen session", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2,default:w3" }
    expect(ok(run(env, ["agent", "get", "dgs-2"]))).toBe(true)
    expect(refused(run(env, ["agent", "get", "tc-dgs-9"]))).toBe(true) // w7 in session default
    expect(ok(run(env, ["--session", "Castle", "agent", "get", "tc-dgs-9"]))).toBe(true)
    expect(refused(run(env, ["--session", "Castle", "agent", "get", "dgs-2"]))).toBe(true) // w3 not a Castle workspace
  })

  it("create needs a --workspace inside the scope for that session", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(ok(run(env, ["tab", "create", "--workspace", "w3", "--label", "x"]))).toBe(true)
    expect(ok(run(env, ["tab", "create", "--workspace", "w2", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w4", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--label", "x", "--workspace"]))).toBe(true)
  })

  it("a repeated --workspace or --pane is refused (scope bypass)", () => {
    const env = { HERDR_SCOPE: "default:w2" }
    expect(refused(run(env, ["tab", "create", "--workspace", "w2", "--workspace", "w9"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w9", "--workspace", "w2"]))).toBe(true)
    expect(refused(run(env, ["agent", "start", "dgs-1", "--pane", "w2:p1", "--pane", "w9:p1"]))).toBe(true)
  })

  it("agent start checks --pane against the scope", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(ok(run(env, ["agent", "start", "dgs-2", "--pane", "w3:p1"]))).toBe(true)
    expect(refused(run(env, ["agent", "start", "dgs-2", "--pane", "w4:p1"]))).toBe(true)
  })

  it("pane and tab list cover every workspace of the session", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2,default:w3" }
    const r = run(env, ["tab", "list"])
    expect(ok(r)).toBe(true)
    expect(r.log).toMatch(/--session default tab list --workspace w2/)
    expect(r.log).toMatch(/--session default tab list --workspace w3/)
    expect(r.log).not.toMatch(/w7/)
    const ids = (JSON.parse(r.stdout).result.tabs as { tab_id: string }[]).map((t) => t.tab_id)
    expect(ids).toEqual(["w2:t1", "w3:t1"])
    expect(JSON.parse(r.stdout).id).toBe("cli:tab:list") // envelope of the first reply is kept
  })

  it("a bad scope text is refused", () => {
    for (const bad of ["Castle:7", "Castle", "7x:w2", "Castle:w7,", ":w2", "Castle:w7:w8"]) {
      expect(refused(run({ HERDR_SCOPE: bad }, ["agent", "list"])), bad).toBe(true)
    }
  })

  it("the session and workspace groups are refused", () => {
    const env = { HERDR_SCOPE: "Castle:w7,default:w2" }
    expect(refused(run(env, ["session", "list"]))).toBe(true)
    expect(refused(run(env, ["workspace", "create"]))).toBe(true)
    expect(refused(run(env, ["--session", "Castle", "server", "stop"]))).toBe(true)
  })

  it("every forwarded call starts with --session <S>, and a caller socket env is dropped", () => {
    const r = run(
      { HERDR_SCOPE: "Castle:w7,default:w2", HERDR_SOCKET_PATH: "/tmp/evil.sock" },
      ["--session", "Castle", "agent", "list"],
    )
    expect(ok(r)).toBe(true)
    expect(r.env.trim().split("\n").every((x) => x === "unset")).toBe(true)
    expect(r.env.trim()).not.toBe("")
    for (const line of r.log.trim().split("\n")) expect(line).toMatch(/^--session (Castle|default) /)
    const r2 = run({ HERDR_SCOPE: "default:w2,default:w3" }, ["agent", "get", "dgs-2"])
    for (const line of r2.log.trim().split("\n")) expect(line).toMatch(/^--session default /)
  })
})

describe("herdr-ws Castle close rule (T11)", () => {
  const env = { HERDR_SCOPE: "Castle:w7,default:w2,default:w3" }
  const castle = (...a: string[]) => run(env, ["--session", "Castle", ...a])

  it("tab close in Castle: a tc- or nw- label passes, any other label is refused", () => {
    expect(ok(castle("tab", "close", "w7:t2"))).toBe(true) // tc-dgs-9
    expect(ok(castle("tab", "close", "w7:t3"))).toBe(true) // nw-5
    const r = castle("tab", "close", "w7:t1") // digismith-conductor
    expect(refused(r)).toBe(true)
    expect(r.log).not.toMatch(/tab close/)
  })

  it("agent stop in Castle: only tc- or nw- agent names", () => {
    expect(refused(castle("agent", "stop", "digismith-conductor"))).toBe(true)
    expect(ok(castle("agent", "stop", "tc-dgs-9"))).toBe(true)
  })

  it("pane close in Castle: only the pane of a tc- or nw- agent", () => {
    expect(ok(castle("pane", "close", "w7:p2"))).toBe(true) // tc-dgs-9
    expect(refused(castle("pane", "close", "w7:p1"))).toBe(true) // digismith-conductor
    expect(refused(castle("pane", "close", "w7:p9"))).toBe(true) // unknown pane fails closed
  })

  it("a Castle close outside the Castle workspaces of the scope is still refused", () => {
    expect(refused(castle("tab", "close", "w8:t2"))).toBe(true)
    expect(refused(castle("tab", "close", "w2:t2"))).toBe(true)
  })

  it("the Castle label rule does not apply to default: old :t1 rule for every scope workspace", () => {
    expect(refused(run(env, ["tab", "close", "w2:t1"]))).toBe(true)
    expect(refused(run(env, ["tab", "close", "w3:t1"]))).toBe(true)
    expect(ok(run(env, ["tab", "close", "w2:t5"]))).toBe(true)
    expect(ok(run(env, ["agent", "stop", "dgs-1"]))).toBe(true)
  })

  it("Castle's :t1 tab is protected by its label, not its position", () => {
    expect(refused(castle("tab", "close", "w7:t4"))).toBe(true) // not tab 1, label digismith-conductor
    expect(ok(castle("tab", "close", "w7:t3"))).toBe(true)
  })

  it("rename bypass: a tc- conductor cannot take over a non-ticket label, so the two-call attack fails", () => {
    expect(refused(castle("tab", "rename", "w7:t1", "tc-x"))).toBe(true) // current label digismith-conductor
    expect(refused(castle("tab", "close", "w7:t1"))).toBe(true)
    expect(refused(castle("agent", "rename", "digismith-conductor", "tc-x"))).toBe(true)
    expect(refused(castle("pane", "rename", "w7:p1", "tc-x"))).toBe(true)
  })

  it("rename keeps the prefix: tc- to tc- passes, tc- to anything else or --clear is refused", () => {
    expect(ok(castle("tab", "rename", "w7:t2", "tc-dgs-10"))).toBe(true)
    expect(ok(castle("tab", "rename", "w7:t3", "nw-6", "extra"))).toBe(true)
    expect(ok(castle("agent", "rename", "tc-dgs-9", "tc-dgs-10"))).toBe(true)
    expect(ok(castle("pane", "rename", "w7:p2", "tc-label"))).toBe(true)
    expect(refused(castle("tab", "rename", "w7:t2", "digismith-conductor"))).toBe(true)
    expect(refused(castle("agent", "rename", "tc-dgs-9", "--clear"))).toBe(true)
    expect(refused(castle("tab", "rename", "w7:t2"))).toBe(true)
  })

  it("rename in default is not restricted by the Castle rule", () => {
    expect(ok(run(env, ["tab", "rename", "w2:t5", "anything"]))).toBe(true)
  })

  it("fails closed: tab get that prints non-JSON refuses the close and the rename", () => {
    expect(refused(castle("tab", "close", "w7:t9"))).toBe(true)
    expect(refused(castle("tab", "rename", "w7:t9", "tc-x"))).toBe(true)
  })

  it("agent stop with a pane-id target follows the owning agent", () => {
    expect(ok(castle("agent", "stop", "w7:p6"))).toBe(true) // tc-dgs-8
    expect(refused(castle("agent", "stop", "w7:p1"))).toBe(true) // digismith-conductor
  })

  it("pane move bypass: a conductor pane cannot be moved into a tc- tab, so the close never gets a tc- label", () => {
    const r = castle("pane", "move", "w7:p1", "--tab", "w7:t2")
    expect(refused(r)).toBe(true)
    expect(r.log).not.toMatch(/pane move/)
    expect(refused(castle("pane", "move", "w7:p1", "--target-pane", "w7:p2"))).toBe(true)
  })

  it("pane move between ticket panes passes; a non-ticket named pane or a bad destination is refused", () => {
    expect(ok(castle("pane", "move", "w7:p2", "--tab", "w7:t3"))).toBe(true)
    expect(ok(castle("pane", "move", "w7:p2", "--target-pane", "w7:p6", "--split", "right"))).toBe(true)
    expect(refused(castle("pane", "move", "w7:p2", "--target-pane", "w7:p1"))).toBe(true)
    expect(refused(castle("pane", "move", "w7:p2", "--new-workspace"))).toBe(true)
    expect(refused(castle("pane", "move", "w7:p2", "--workspace", "w2"))).toBe(true)
    expect(refused(castle("pane", "move", "w7:p2", "--tab", "w9:t1"))).toBe(true)
    expect(refused(castle("pane", "move", "w7:p2", "--tab", "w2:t1"))).toBe(true)
  })

  it("pane swap in Castle: every pane must be named and belong to a ticket agent", () => {
    expect(ok(castle("pane", "swap", "--source-pane", "w7:p2", "--target-pane", "w7:p6"))).toBe(true)
    expect(refused(castle("pane", "swap", "--source-pane", "w7:p2", "--target-pane", "w7:p1"))).toBe(true)
    expect(refused(castle("pane", "swap", "--pane", "w7:p2", "--direction", "left"))).toBe(true) // neighbour is implicit
    expect(refused(castle("pane", "swap", "--current", "--direction", "left"))).toBe(true)
    expect(refused(castle("pane", "swap", "--source-pane", "w7:p2"))).toBe(true)
  })

  it("default: pane move stays inside the scope for every named pane and destination", () => {
    expect(ok(run(env, ["pane", "move", "w2:p1", "--tab", "w3:t1"]))).toBe(true)
    expect(ok(run(env, ["pane", "swap", "--source-pane", "w2:p1", "--target-pane", "w3:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "move", "w2:p1", "--tab", "w9:t1"]))).toBe(true)
    expect(refused(run(env, ["pane", "move", "w2:p1", "--target-pane", "w9:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "swap", "--source-pane", "w2:p1", "--target-pane", "w9:p1"]))).toBe(true)
  })
})

describe("herdr-ws cross-project audit log (T12)", () => {
  let depot: string
  beforeEach(() => { depot = path.join(dir, "depot") })
  const base = () => ({ HERDR_WS: "w2", HERDR_SCOPE: "Castle:w7,default:w2,default:w3", DIGISMITH_DEPOT_DIR: depot, DIGISMITH_NAME: "digismith-conductor" })
  const logFile = (n: string) => path.join(depot, "drivers", n)
  const lines = (n: string) => fs.readFileSync(logFile(n), "utf8").trim().split("\n").map((l) => JSON.parse(l))

  it("an act on another Floor workspace writes one line to _unmapped.log when the agent name has no ticket key", () => {
    const r = run(base(), ["agent", "prompt", "scout-a", "hi"])
    expect(ok(r)).toBe(true)
    const l = lines("_unmapped.log")
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ who: "digismith-conductor", target: "scout-a", workspace: "w3", verb: "agent prompt" })
    expect(l[0].time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+07:00$/)
  })

  it("the key is the first DGS-<n> of the agent name, uppercased (dgs-2 gives DGS-2.log)", () => {
    run(base(), ["agent", "prompt", "dgs-2", "hi"])
    expect(lines("DGS-2.log")[0]).toMatchObject({ target: "dgs-2", workspace: "w3" })
    expect(fs.existsSync(logFile("_unmapped.log"))).toBe(false)
  })

  it("a target agent named with a ticket key writes drivers/<KEY>.log", () => {
    run(base(), ["agent", "prompt", "dgs-683-b", "hi"])
    expect(lines("DGS-683.log")[0]).toMatchObject({ target: "dgs-683-b", workspace: "w3", verb: "agent prompt" })
    expect(fs.existsSync(logFile("_unmapped.log"))).toBe(false)
  })

  it("a pane target is mapped to its agent's ticket key; a tab target is unmapped", () => {
    run(base(), ["pane", "send-text", "w3:p2", "x"])
    expect(lines("DGS-683.log")[0]).toMatchObject({ target: "w3:p2", workspace: "w3", verb: "pane send-text" })
    run(base(), ["tab", "close", "w3:t5"])
    expect(lines("_unmapped.log")[0]).toMatchObject({ target: "w3:t5", verb: "tab close" })
  })

  it("create and start name their workspace through --workspace and --pane", () => {
    run(base(), ["tab", "create", "--workspace", "w3", "--label", "x"])
    run(base(), ["agent", "start", "scout-a", "--pane", "w3:p3"])
    const l = lines("_unmapped.log")
    expect(l.map((x) => [x.verb, x.workspace])).toEqual([["tab create", "w3"], ["agent start", "w3"]])
  })

  it("own workspace, read verbs, Castle acts and an unset HERDR_WS write nothing", () => {
    run(base(), ["agent", "prompt", "dgs-1", "hi"])
    run(base(), ["agent", "list"])
    run(base(), ["agent", "get", "dgs-2"])
    run(base(), ["pane", "read", "w3:p1"])
    run(base(), ["tab", "list"])
    run(base(), ["--session", "Castle", "agent", "get", "tc-dgs-9"])
    run(base(), ["--session", "Castle", "tab", "rename", "w7:t2", "tc-y"])
    expect(fs.existsSync(path.join(depot, "drivers"))).toBe(false)
  })

  it("a refused call writes nothing", () => {
    expect(refused(run(base(), ["agent", "prompt", "w9-nobody", "hi"]))).toBe(true)
    expect(refused(run(base(), ["pane", "send-text", "w4:p1", "x"]))).toBe(true)
    expect(fs.existsSync(path.join(depot, "drivers"))).toBe(false)
  })

  it("who is unknown when DIGISMITH_NAME is unset; the depot falls back to HOME/.digismith-depot", () => {
    const e: Record<string, string> = { ...base(), HOME: dir }
    delete e.DIGISMITH_NAME
    delete e.DIGISMITH_DEPOT_DIR
    run(e, ["agent", "prompt", "scout-a", "hi"])
    const f = path.join(dir, ".digismith-depot", "drivers", "_unmapped.log")
    expect(JSON.parse(fs.readFileSync(f, "utf8").trim()).who).toBe("unknown")
  })

  it("an unwritable depot does not block an allowed call: exit 0, one line on stderr", () => {
    fs.writeFileSync(depot, "a file, not a directory")
    const r = run(base(), ["agent", "prompt", "dgs-2", "hi"])
    expect(ok(r)).toBe(true)
    expect(r.log).toMatch(/agent prompt dgs-2 hi/) // the call was forwarded
    expect(r.stderr.trim().split("\n")).toHaveLength(1)
    expect(r.stderr).toMatch(/herdr-ws: audit log not written/)
  })
})

describe("herdr-ws pane move/swap parsing and its audit log (T12 r1 fixes)", () => {
  const env = { HERDR_SCOPE: "default:w2" }
  const mv = (...a: string[]) => run(env, ["pane", ...a])

  it("an option before the positional pane cannot hide a pane outside the scope", () => {
    const r = mv("move", "--target-pane", "w2:p1", "w9:p1")
    expect(refused(r)).toBe(true)
    expect(r.log).not.toMatch(/pane move/)
    expect(refused(mv("move", "--tab", "w2:t1", "w9:p1"))).toBe(true)
    expect(refused(mv("move", "--focus", "w9:p1"))).toBe(true)
    expect(ok(mv("move", "--tab", "w2:t1", "w2:p1"))).toBe(true)
    expect(ok(mv("move", "--focus", "--tab", "w2:t1", "w2:p1"))).toBe(true)
  })

  it("the --flag=value form is refused for every flag, so it cannot hide a destination or pane", () => {
    for (const f of ["--tab=w9:t1", "--target-pane=w9:p1", "--source-pane=w9:p1", "--workspace=w9", "--pane=w9:p1", "--split=right"]) {
      expect(refused(mv("move", "w2:p1", f)), f).toBe(true)
      expect(refused(mv("swap", "--source-pane", "w2:p1", "--target-pane", "w2:p1", f)), f).toBe(true)
    }
  })

  it("an unknown flag, a second positional, a bare -- or a flag without its value is refused", () => {
    expect(refused(mv("move", "w2:p1", "--bogus"))).toBe(true)
    expect(refused(mv("move", "w2:p1", "-x"))).toBe(true)
    expect(refused(mv("move", "w2:p1", "w2:p2"))).toBe(true)
    expect(refused(mv("move", "w2:p1", "--"))).toBe(true)
    expect(refused(mv("move", "w2:p1", "--tab"))).toBe(true)
    expect(refused(mv("swap", "w2:p1"))).toBe(true) // swap takes no positional
  })

  it("a value flag consumes its value: a value that looks like a pane is not a positional", () => {
    expect(ok(mv("move", "w2:p1", "--label", "w9:p1"))).toBe(true)
  })

  it("the Castle checks hold with options before the positional", () => {
    const c = (...a: string[]) => run({ HERDR_SCOPE: "Castle:w7,default:w2" }, ["--session", "Castle", "pane", ...a])
    expect(refused(c("move", "--target-pane", "w7:p2", "w7:p1"))).toBe(true) // conductor pane is the positional
    expect(ok(c("move", "--target-pane", "w7:p6", "w7:p2"))).toBe(true)
    expect(refused(c("move", "--tab=w7:t2", "w7:p2"))).toBe(true)
  })

  describe("audit log names every pane or destination outside HERDR_WS", () => {
    let depot: string
    beforeEach(() => { depot = path.join(dir, "depot") })
    const e = () => ({ HERDR_WS: "w2", HERDR_SCOPE: "default:w2,default:w3", DIGISMITH_DEPOT_DIR: depot, DIGISMITH_NAME: "x-conductor" })
    const all = () => {
      const out: Record<string, unknown>[] = []
      for (const f of fs.existsSync(path.join(depot, "drivers")) ? fs.readdirSync(path.join(depot, "drivers")) : [])
        for (const l of fs.readFileSync(path.join(depot, "drivers", f), "utf8").trim().split("\n")) out.push({ ...JSON.parse(l), file: f })
      return out
    }

    it("move of an own pane into another workspace's tab logs the destination", () => {
      run(e(), ["pane", "move", "w2:p1", "--tab", "w3:t1"])
      expect(all()).toMatchObject([{ target: "w3:t1", workspace: "w3", verb: "pane move", file: "_unmapped.log" }])
    })

    it("move of another workspace's pane next to an own pane logs the pane under its ticket key", () => {
      run(e(), ["pane", "move", "w3:p2", "--target-pane", "w2:p1"])
      expect(all()).toMatchObject([{ target: "w3:p2", workspace: "w3", file: "DGS-683.log" }])
    })

    it("swap of two panes in another workspace logs both", () => {
      run(e(), ["pane", "swap", "--source-pane", "w3:p1", "--target-pane", "w3:p3"])
      expect(all().map((x) => x.target)).toEqual(["w3:p1", "w3:p3"])
    })

    it("a move inside the own workspace logs nothing", () => {
      run(e(), ["pane", "move", "w2:p1", "--tab", "w2:t2"])
      expect(all()).toEqual([])
    })
  })
})

describe("herdr-ws second targets by flag and the = form (ticket review r1 F1)", () => {
  const env = { HERDR_SCOPE: "default:w2,default:w3" }
  const one = { HERDR_SCOPE: "default:w2" }
  it("a second pane given by --pane must be in the scope, for every verb that takes one", () => {
    for (const args of [
      ["pane", "split", "w2:p1", "--pane", "w9:p1"],
      ["pane", "focus", "w2:p1", "--direction", "left", "--pane", "w9:p1"],
      ["pane", "zoom", "w2:p1", "--pane", "w9:p1"],
      ["pane", "resize", "w2:p1", "--pane", "w9:p1"],
      ["pane", "neighbor", "w2:p1", "--pane", "w9:p1"],
      ["pane", "input", "w2:p1", "--pane", "w9:p1"],
      ["pane", "read", "w2:p1", "--source-pane", "w9:p1"],
      ["pane", "split", "w2:p1", "--target-pane", "w9:p1"],
      ["tab", "focus", "w2:t1", "--tab", "w9:t1"],
      ["tab", "focus", "w2:t1", "--workspace", "w9"],
    ]) {
      const r = run(one, args)
      expect(refused(r), args.join(" ")).toBe(true)
      expect(r.log, args.join(" ")).toBe("")
    }
  })

  it("a text payload with a --flag=value part passes as ONE quoted argument, and is refused as separate words", () => {
    expect(ok(run(one, ["pane", "run", "w2:p1", "git log --format=%h"]))).toBe(true)
    expect(refused(run(one, ["pane", "run", "w2:p1", "git", "log", "--format=%h"]))).toBe(true)
  })

  it("a second target inside the scope passes", () => {
    expect(ok(run(env, ["pane", "split", "w2:p1", "--pane", "w3:p1"]))).toBe(true)
    expect(ok(run(env, ["tab", "focus", "w2:t1", "--workspace", "w3"]))).toBe(true)
  })

  it("--current is refused (an implicit target cannot be checked)", () => {
    expect(refused(run(env, ["pane", "split", "w2:p1", "--current"]))).toBe(true)
  })

  it("the --flag=value form is refused for every verb outside list", () => {
    for (const args of [
      ["tab", "create", "--workspace", "w2", "--workspace=w9"],
      ["tab", "create", "--workspace=w9"],
      ["pane", "split", "w2:p1", "--pane=w9:p1"],
      ["pane", "split", "w2:p1", "--direction=right"],
      ["agent", "start", "dgs-1", "--pane", "w2:p1", "--pane=w9:p1"],
      ["agent", "prompt", "dgs-1", "--x=1"],
    ]) expect(refused(run(one, args)), args.join(" ")).toBe(true)
  })
})

describe("herdr-ws audit log without HERDR_WS and with agent and pane (ticket review r1 F2, F3)", () => {
  let depot: string
  beforeEach(() => { depot = path.join(dir, "depot") })
  const one = (f: string) => JSON.parse(fs.readFileSync(path.join(depot, "drivers", f), "utf8").trim())

  it("HERDR_SCOPE only: the line is still written, own=unknown, in _unmapped.log", () => {
    const r = run({ HERDR_SCOPE: "default:w2,default:w3", DIGISMITH_DEPOT_DIR: depot, DIGISMITH_NAME: "tc-dgs-5" }, ["agent", "prompt", "dgs-683-b", "hi"])
    expect(ok(r)).toBe(true)
    expect(one("_unmapped.log")).toMatchObject({ who: "tc-dgs-5", own: "unknown", target: "dgs-683-b", workspace: "w3", verb: "agent prompt" })
    expect(fs.existsSync(path.join(depot, "drivers", "DGS-683.log"))).toBe(false)
  })

  it("HERDR_SCOPE only: every non-read Floor act is logged, reads are not", () => {
    const e = { HERDR_SCOPE: "default:w2,default:w3", DIGISMITH_DEPOT_DIR: depot }
    run(e, ["agent", "list"])
    run(e, ["pane", "read", "w3:p1"])
    expect(fs.existsSync(path.join(depot, "drivers"))).toBe(false)
    run(e, ["pane", "send-text", "w2:p1", "x"])
    expect(one("_unmapped.log")).toMatchObject({ own: "unknown", target: "w2:p1", pane: "w2:p1", agent: "dgs-1" })
  })

  it("the line records own, agent and pane", () => {
    const e = { HERDR_WS: "w2", HERDR_SCOPE: "default:w2,default:w3", DIGISMITH_DEPOT_DIR: depot, DIGISMITH_NAME: "x" }
    run(e, ["pane", "send-text", "w3:p2", "x"])
    expect(one("DGS-683.log")).toMatchObject({ own: "w2", target: "w3:p2", pane: "w3:p2", agent: "dgs-683-b" })
    run(e, ["agent", "prompt", "scout-a", "hi"])
    expect(one("_unmapped.log")).toMatchObject({ own: "w2", agent: "scout-a", workspace: "w3" })
  })
})

