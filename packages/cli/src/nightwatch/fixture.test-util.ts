// packages/cli/src/nightwatch/fixture.test-util.ts
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "../run/record.ts";

export interface FakeRun { ticket: string; run: string; role: RunRecord["role"]; created_at: string; order?: string | null; seat?: string | null; model?: string | null; worktree?: string | null; branch?: string | null }
export interface FakeEvent { type: string; ts: string; data?: Record<string, unknown> }
export interface Depot {
  dir: string; env: NodeJS.ProcessEnv; autonomous: string;
  writeRun(r: FakeRun): string;
  writeEvents(ticket: string, run: string, lines: FakeEvent[]): void;
  writeJournal(lines: object[]): void;
  writeAttention(lines: object[]): void;
  writeAutonomousEvent(day: string, ev: object): void;
  cleanup(): void;
}

export function makeDepot(): Depot {
  const dir = mkdtempSync(join(tmpdir(), "nw-depot-"));
  const autonomous = join(dir, "autonomous");
  mkdirSync(autonomous, { recursive: true });
  const env = { DIGISMITH_DEPOT_DIR: dir, AUTONOMOUS_DIR: autonomous } as NodeJS.ProcessEnv;
  const jsonl = (file: string, lines: object[]): void => writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return {
    dir, env, autonomous,
    writeRun(r) {
      const d = join(dir, "runs", r.ticket, r.run);
      mkdirSync(d, { recursive: true });
      const rec: RunRecord = {
        schema: "nightwatch-run/v1", run: r.run, ticket: r.ticket, role: r.role, order: r.order ?? null, seat: r.seat ?? null,
        model: r.model ?? null, plugin_version: null, base_sha: null, branch: r.branch ?? null, worktree: r.worktree ?? null,
        herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: r.created_at,
      };
      writeFileSync(join(d, "run.json"), JSON.stringify(rec));
      return d;
    },
    writeEvents(ticket, run, lines) {
      const d = join(dir, "runs", ticket, run);
      jsonl(join(d, "events.jsonl"), lines.map((l, i) => ({ schema: "nightwatch-event/v1", seq: i + 1, ts: l.ts, run, type: l.type, data: l.data ?? {} })));
    },
    writeJournal: (lines) => jsonl(join(autonomous, "journal.jsonl"), lines),
    writeAttention: (lines) => jsonl(join(autonomous, "attention.jsonl"), lines),
    writeAutonomousEvent(day, ev) { appendFileSync(join(autonomous, `events-${day}.jsonl`), `${JSON.stringify(ev)}\n`); },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
