// DGS-438 (d): the per-session stamp the idle catch-up reads. One small JSON file per session in the
// depot (never the repo): <depot>/sessions/<project>/.idle/<session>.json. It holds the time of Jack's
// last real prompt in THIS session and what the last catch-up asked for (repo head, conductor Updated:).
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../depot-dir.ts";
import { isSafeName } from "./safe-name.ts";

export interface IdleStamp {
  /** ISO instant of the previous real Jack prompt in this session */
  last_prompt: string;
  /** origin/main head and conductor state-block "Updated:" at the last catch-up this session asked for */
  caught_up_head?: string;
  caught_up_updated?: string;
  caught_up_at?: string;
}

function stampFile(project: string, session: string, env: NodeJS.ProcessEnv): string {
  if (!isSafeName(project) || !isSafeName(session)) throw new Error("idle stamp: unsafe project or session name");
  return path.join(depotDir(env), "sessions", project, ".idle", `${session}.json`);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length < 200 ? v : undefined);

/** A missing, damaged or foreign file reads as no stamp. */
export function readStamp(project: string, session: string, env: NodeJS.ProcessEnv = process.env): IdleStamp | undefined {
  try {
    const o = JSON.parse(fs.readFileSync(stampFile(project, session, env), "utf8")) as Record<string, unknown>;
    const last_prompt = str(o.last_prompt);
    if (!last_prompt) return undefined;
    return { last_prompt, caught_up_head: str(o.caught_up_head), caught_up_updated: str(o.caught_up_updated), caught_up_at: str(o.caught_up_at) };
  } catch {
    return undefined;
  }
}

/** Atomic: write a temp file in the same folder, then rename. */
export function writeStamp(project: string, session: string, stamp: IdleStamp, env: NodeJS.ProcessEnv = process.env): void {
  const file = stampFile(project, session, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stamp) + "\n");
  fs.renameSync(tmp, file);
}
