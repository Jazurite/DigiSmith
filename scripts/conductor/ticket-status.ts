// ClickUp status of a ticket key, read only (`dg clickup get-task`); the task id comes from the board folder.
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const KEY = /^DGS-\d+$/;
const TASK_ID = /\b(14z[a-z0-9]{8,})\b/;

/** S12: a key needs its task id first: read it from the board folder (ticket.md or plan.md); else unresolved. */
export function taskIdForKey(key: string, repoRoot: string): string | undefined {
  const board = path.join(repoRoot, ".digismith", "board");
  if (!KEY.test(key) || !fs.existsSync(board)) return undefined;
  for (const dir of fs.readdirSync(board).filter((d) => d.startsWith(`${key}—`) || d.startsWith(`${key}-`))) {
    for (const f of ["ticket.md", "plan.md"]) {
      const p = path.join(board, dir, f);
      if (fs.existsSync(p)) {
        const m = TASK_ID.exec(fs.readFileSync(p, "utf8"));
        if (m) return m[1];
      }
    }
  }
  return undefined;
}

export async function ticketStatus(key: string, repoRoot: string): Promise<string | undefined> {
  const id = taskIdForKey(key, repoRoot);
  if (!id) return undefined;
  try {
    const { stdout } = await run("dg", ["clickup", "get-task", id], { timeout: 20_000 });
    return (JSON.parse(stdout) as { status?: { status?: string } }).status?.status;
  } catch {
    return undefined;
  }
}
