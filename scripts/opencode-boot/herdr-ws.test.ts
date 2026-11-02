import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SOURCE = path.join(__dirname, "herdr-ws")

const FAKE = `#!/bin/sh
# argv: --session S <group> <verb> ...
echo "$@" >> "$FAKE_LOG"
S="$2"; shift 2
case "$1 $2" in
  "agent list") echo '{"result":{"agents":[{"name":"dgs-1","pane_id":"w2:p1","workspace_id":"w2"},{"name":"dgs-2","pane_id":"w3:p1","workspace_id":"w3"},{"name":"dgs-683-b","pane_id":"w3:p2","workspace_id":"w3"},{"name":"tc-dgs-9","pane_id":"w7:p2","workspace_id":"w7"},{"name":"digismith-conductor","pane_id":"w7:p1","workspace_id":"w7"}]}}' ;;
  "agent get") case "$3" in dgs-1) W=w2;; dgs-2) W=w3;; dgs-683-b) W=w3;; tc-dgs-9|digismith-conductor) W=w7;; esac; echo "{\\"result\\":{\\"agent\\":{\\"name\\":\\"$3\\",\\"workspace_id\\":\\"$W\\"}}}" ;;
  "tab get") case "$3" in w7:t2) L=tc-dgs-9;; *) L=digismith-conductor;; esac; echo "{\\"result\\":{\\"tab\\":{\\"tab_id\\":\\"$3\\",\\"label\\":\\"$L\\"}}}" ;;
  "tab list") echo "{\\"result\\":{\\"tabs\\":[{\\"tab_id\\":\\"$4:t1\\",\\"workspace_id\\":\\"$4\\"}]}}" ;;
  *) echo '{"result":{}}' ;;
esac
`

let dir: string
let copy: string
let log: string

type R = { status: number | null; stdout: string; stderr: string; log: string }

function run(env: Record<string, string>, args: string[]): R {
  fs.writeFileSync(log, "")
  const r = spawnSync("python3", [copy, ...args], {
    env: { PATH: "/usr/bin:/bin", FAKE_LOG: log, ...env },
    encoding: "utf8",
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, log: fs.readFileSync(log, "utf8") }
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

  it("HERDR_WS alone refuses --session Suite", () => {
    expect(refused(run({ HERDR_WS: "w2" }, ["--session", "Suite", "agent", "list"]))).toBe(true)
  })

  it("scope with several default pairs: default list shows only default workspaces, Suite list only w7", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2,default:w3" }
    expect(names(run(env, ["agent", "list"])).sort()).toEqual(["dgs-1", "dgs-2", "dgs-683-b"])
    expect(names(run(env, ["--session", "Suite", "agent", "list"])).sort()).toEqual(["digismith-conductor", "tc-dgs-9"])
  })

  it("a session outside the scope is refused", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2" }
    expect(refused(run(env, ["--session", "other", "agent", "list"]))).toBe(true)
  })

  it("a scope without default refuses a call with no --session", () => {
    expect(refused(run({ HERDR_SCOPE: "Suite:w7" }, ["agent", "list"]))).toBe(true)
  })

  it("a second --session or any --socket later in argv is refused", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(refused(run(env, ["tab", "create", "--session", "x", "--workspace", "w2"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w2", "--session=x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w2", "--socket", "/tmp/s"]))).toBe(true)
    expect(refused(run(env, ["--session", "default", "--session", "Suite", "agent", "list"]))).toBe(true)
  })

  it("a target outside the scope is refused (pane read w4:p1 with w2,w3)", () => {
    expect(refused(run({ HERDR_SCOPE: "default:w2,default:w3" }, ["pane", "read", "w4:p1"]))).toBe(true)
  })

  it("every default pair is reachable; a default workspace outside the scope is not", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2,default:w3" }
    expect(ok(run(env, ["pane", "read", "w2:p1"]))).toBe(true)
    expect(ok(run(env, ["pane", "read", "w3:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w4:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w7:p1"]))).toBe(true) // w7 is a Suite workspace, not a default one
  })

  it("the same workspace id in Suite is not accepted through a default pair", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2" }
    expect(ok(run(env, ["--session", "Suite", "pane", "read", "w7:p1"]))).toBe(true)
    expect(refused(run(env, ["--session", "Suite", "pane", "read", "w2:p1"]))).toBe(true)
    expect(refused(run(env, ["pane", "read", "w7:p1"]))).toBe(true)
  })

  it("agent name targets are resolved in the chosen session", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2,default:w3" }
    expect(ok(run(env, ["agent", "get", "dgs-2"]))).toBe(true)
    expect(refused(run(env, ["agent", "get", "tc-dgs-9"]))).toBe(true) // w7 in session default
    expect(ok(run(env, ["--session", "Suite", "agent", "get", "tc-dgs-9"]))).toBe(true)
    expect(refused(run(env, ["--session", "Suite", "agent", "get", "dgs-2"]))).toBe(true) // w3 not a Suite workspace
  })

  it("create needs a --workspace inside the scope for that session", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(ok(run(env, ["tab", "create", "--workspace", "w3", "--label", "x"]))).toBe(true)
    expect(ok(run(env, ["tab", "create", "--workspace", "w2", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--workspace", "w4", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--label", "x"]))).toBe(true)
    expect(refused(run(env, ["tab", "create", "--label", "x", "--workspace"]))).toBe(true)
  })

  it("agent start checks --pane against the scope", () => {
    const env = { HERDR_SCOPE: "default:w2,default:w3" }
    expect(ok(run(env, ["agent", "start", "dgs-2", "--pane", "w3:p1"]))).toBe(true)
    expect(refused(run(env, ["agent", "start", "dgs-2", "--pane", "w4:p1"]))).toBe(true)
  })

  it("pane and tab list cover every workspace of the session", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2,default:w3" }
    const r = run(env, ["tab", "list"])
    expect(ok(r)).toBe(true)
    expect(r.log).toMatch(/--session default tab list --workspace w2/)
    expect(r.log).toMatch(/--session default tab list --workspace w3/)
    expect(r.log).not.toMatch(/w7/)
    const ids = (JSON.parse(r.stdout).result.tabs as { tab_id: string }[]).map((t) => t.tab_id)
    expect(ids).toEqual(["w2:t1", "w3:t1"])
  })

  it("a bad scope text is refused", () => {
    for (const bad of ["Suite:7", "Suite", "7x:w2", "Suite:w7,", ":w2", "Suite:w7:w8"]) {
      expect(refused(run({ HERDR_SCOPE: bad }, ["agent", "list"])), bad).toBe(true)
    }
  })

  it("the session and workspace groups are refused", () => {
    const env = { HERDR_SCOPE: "Suite:w7,default:w2" }
    expect(refused(run(env, ["session", "list"]))).toBe(true)
    expect(refused(run(env, ["workspace", "create"]))).toBe(true)
    expect(refused(run(env, ["--session", "Suite", "server", "stop"]))).toBe(true)
  })

  it("every forwarded call starts with --session <S>, and a caller socket env is dropped", () => {
    const r = run(
      { HERDR_SCOPE: "Suite:w7,default:w2", HERDR_SOCKET_PATH: "/tmp/evil.sock" },
      ["--session", "Suite", "agent", "list"],
    )
    expect(ok(r)).toBe(true)
    for (const line of r.log.trim().split("\n")) expect(line).toMatch(/^--session (Suite|default) /)
    const r2 = run({ HERDR_SCOPE: "default:w2,default:w3" }, ["agent", "get", "dgs-2"])
    for (const line of r2.log.trim().split("\n")) expect(line).toMatch(/^--session default /)
  })
})
