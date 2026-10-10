import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entryPath = join(dirname(fileURLToPath(import.meta.url)), "entry.ts");

function fixture() {
  const projects = mkdtempSync(join(tmpdir(), "proj-"));
  const registry = mkdtempSync(join(tmpdir(), "reg-"));
  const dir = join(projects, "-a");
  mkdirSync(dir, { recursive: true });
  const sid = "sess-1";
  const usage = (output: number) => ({ input_tokens: 2, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } });
  writeFileSync(
    join(dir, `${sid}.jsonl`),
    [
      JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" }),
      JSON.stringify({ type: "assistant", sessionId: sid, requestId: "r1", timestamp: "2026-10-10T01:00:00Z", message: { id: "m1", model: "claude-opus-5-5", usage: usage(10) } }),
    ].join("\n"),
  );
  mkdirSync(join(dir, sid, "subagents"), { recursive: true });
  writeFileSync(
    join(dir, sid, "subagents", "agent-a111.jsonl"),
    JSON.stringify({ type: "assistant", sessionId: sid, agentId: "a111", requestId: "q1", timestamp: "2026-10-10T01:05:00Z", message: { id: "s1", model: "claude-opus-5-5", usage: usage(7) } }),
  );
  return { projects, registry, sid };
}

function run(args: string[], env: { projects: string; registry: string; session?: string }, cwd?: string) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, DIGISMITH_TOKEN_REGISTRY_DIR: env.registry, DIGISMITH_CLAUDE_PROJECTS_DIR: env.projects };
  delete childEnv.CLAUDE_CODE_SESSION_ID;
  if (env.session !== undefined) childEnv.CLAUDE_CODE_SESSION_ID = env.session;
  return spawnSync("node", ["--experimental-strip-types", entryPath, ...args], { env: childEnv, encoding: "utf-8", cwd });
}

const lines = (registry: string, ticket = "T-1") => {
  const f = join(registry, `${ticket}.jsonl`);
  return existsSync(f) ? readFileSync(f, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

describe("entry.ts", () => {
  it("a: session appends one session line", () => {
    const f = fixture();
    const r = run(["session", "--ticket", "T-1", "--role", "worker", "--session-id", "sess-1"], f);
    expect(r.status).toBe(0);
    const l = lines(f.registry);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "session", ticket: "T-1", session_id: "sess-1", role: "worker", source: "claude-code" });
  });

  it("a2: appending the same session twice leaves one line", () => {
    const f = fixture();
    const args = ["session", "--ticket", "T-1", "--role", "worker", "--session-id", "sess-1"];
    run(args, f);
    expect(run(args, f).status).toBe(0);
    expect(lines(f.registry)).toHaveLength(1);
  });

  it("b: step-start appends a step_start line", () => {
    const f = fixture();
    const r = run(["step-start", "--ticket", "T-1", "--step", "brainstorming", "--session-id", "sess-1"], f);
    expect(r.status).toBe(0);
    expect(lines(f.registry)[0]).toMatchObject({ kind: "step_start", step: "brainstorming", session_id: "sess-1" });
  });

  it("b2: step-end appends a step_end line", () => {
    const f = fixture();
    run(["step-end", "--ticket", "T-1", "--step", "finishing", "--session-id", "sess-1"], f);
    expect(lines(f.registry)[0]).toMatchObject({ kind: "step_end", step: "finishing" });
  });

  it("c: no id anywhere warns on stderr, writes nothing, exits 0", () => {
    const f = fixture();
    const r = run(["session", "--ticket", "T-1", "--role", "worker"], f);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/session/i);
    expect(lines(f.registry)).toHaveLength(0);
  });

  it("c2: the environment variable is used when no flag is given", () => {
    const f = fixture();
    run(["session", "--ticket", "T-1", "--role", "worker"], { ...f, session: "s9" });
    expect(lines(f.registry)[0]).toMatchObject({ session_id: "s9" });
  });

  it("c3: the flag wins over the environment variable", () => {
    const f = fixture();
    run(["session", "--ticket", "T-1", "--role", "worker", "--session-id", "sess-1"], { ...f, session: "s9" });
    expect(lines(f.registry)[0]).toMatchObject({ session_id: "sess-1" });
  });

  it("c4: an environment value with a slash is refused with a warning", () => {
    const f = fixture();
    const r = run(["step-start", "--ticket", "T-1", "--step", "other"], { ...f, session: "a/b" });
    expect(r.status).toBe(0);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(lines(f.registry)).toHaveLength(0);
  });

  it("c5: a usable id with no transcript still writes and warns", () => {
    const f = fixture();
    const r = run(["session", "--ticket", "T-1", "--role", "worker", "--session-id", "ghost"], f);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/ghost/);
    expect(lines(f.registry)).toHaveLength(1);
  });

  it("d: an unknown step exits 1", () => {
    const f = fixture();
    const r = run(["step-start", "--ticket", "T-1", "--step", "bogus", "--session-id", "sess-1"], f);
    expect(r.status).toBe(1);
    expect(lines(f.registry)).toHaveLength(0);
  });

  it("d2: an unknown role exits 1", () => {
    const f = fixture();
    expect(run(["session", "--ticket", "T-1", "--role", "boss", "--session-id", "sess-1"], f).status).toBe(1);
  });

  it("e: snapshot prints a table with the ticket", () => {
    const f = fixture();
    const r = run(["snapshot", "--ticket", "T-1"], f);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ticket T-1");
  });

  it("task-tokens sums the records of the ledger's agent ids", () => {
    const f = fixture();
    run(["session", "--ticket", "T-1", "--role", "worker", "--session-id", "sess-1"], f);
    const ledger = join(mkdtempSync(join(tmpdir(), "led-")), "ledger.md");
    writeFileSync(ledger, "Task 3: dispatch implementer agent=a111\nTask 4: complete\n");
    const r = run(["task-tokens", "--ticket", "T-1", "--task", "3", "--ledger", ledger], f);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("Task 3: tokens in=2 out=7 cr=100 cw5=10 cw1=20");
    const none = run(["task-tokens", "--ticket", "T-1", "--task", "4", "--ledger", ledger], f);
    expect(none.stdout.trim()).toBe("Task 4: tokens in=0 out=0 cr=0 cw5=0 cw1=0");
  });

  describe("snapshot --write and the tasks section", () => {
    const counts = { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 5 };
    const oldTasks = { "9": { "claude-opus-5-5": counts } };
    const snapFile = (f: { registry: string }, ticket = "T-1") => join(f.registry, `${ticket}.tokens.json`);
    const seed = (f: { registry: string }, body: string) => writeFileSync(snapFile(f), body);
    const old = (ticket: string, version = 1) => JSON.stringify({ schema_version: version, ticket, generated_at: "x", reader_versions: {}, steps: {}, tasks: oldTasks, sessions: [], unattributed: {} });
    const read = (f: { registry: string }) => JSON.parse(readFileSync(snapFile(f), "utf-8"));
    const tempCwd = () => mkdtempSync(join(tmpdir(), "cwd-"));
    const setup = () => {
      const f = fixture();
      run(["session", "--ticket", "T-1", "--role", "worker", "--session-id", "sess-1"], f);
      return f;
    };

    it("carries the old tasks over when no ledger is given", () => {
      const f = setup();
      seed(f, old("T-1"));
      const r = run(["snapshot", "--ticket", "T-1", "--write"], f, tempCwd());
      expect(r.status).toBe(0);
      const s = read(f);
      expect(s.tasks).toEqual(oldTasks);
      expect(s.generated_at).not.toBe("x");
      expect(Object.keys(s.steps).length + s.sessions.length).toBeGreaterThan(0);
      expect(s.sessions[0].session_id).toBe("sess-1");
    });

    it("replaces the old tasks when a ledger is given", () => {
      const f = setup();
      seed(f, old("T-1"));
      const ledger = join(mkdtempSync(join(tmpdir(), "led-")), "ledger.md");
      writeFileSync(ledger, "Task 3: dispatch implementer agent=a111\n");
      const r = run(["snapshot", "--ticket", "T-1", "--ledger", ledger, "--write"], f, tempCwd());
      expect(r.status).toBe(0);
      const s = read(f);
      expect(Object.keys(s.tasks)).toEqual(["3"]);
      expect(s.tasks["9"]).toBeUndefined();
    });

    it("does not carry tasks over from another ticket", () => {
      const f = setup();
      seed(f, old("T-2"));
      const r = run(["snapshot", "--ticket", "T-1", "--write"], f, tempCwd());
      expect(r.status).toBe(0);
      expect(read(f).tasks).toEqual({});
    });

    it("does not carry tasks over from a wrong schema version", () => {
      const f = setup();
      seed(f, old("T-1", 2));
      expect(run(["snapshot", "--ticket", "T-1", "--write"], f, tempCwd()).status).toBe(0);
      expect(read(f).tasks).toEqual({});
    });

    it("does not carry over from a corrupt file and does not crash", () => {
      const f = setup();
      seed(f, "{not json");
      const r = run(["snapshot", "--ticket", "T-1", "--write"], f, tempCwd());
      expect(r.status).toBe(0);
      expect(read(f).tasks).toEqual({});
    });
  });
});
