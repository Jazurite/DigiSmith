// Catch-up behaviour (DGS-428, design section 7): window, collect, render, write ONE block per
// identity into the conductor's note. Dependencies are injected; deps-stub.ts holds the real
// ones until DGS-417, 422 and 427 merge.
import { computeWindow, toUtc7, type CardRow, type WindowCard } from "./catch-up-window.ts";
import type { CatchUp } from "../catch-up.ts";
import { catchUpMarker, extractBlock, type Marker } from "./state-block.ts";
import type { CatchUpState } from "./state.ts";

export type StatePart = CatchUpState;

export interface ClickUpInfo {
  key: string;
  status?: string;
  unresolved?: boolean;
}

export interface CatchUpDeps {
  listCards(project: string): CardRow[];
  collectState(opts: { project: string; conductor: string; since: string; notePath?: string }): Promise<StatePart & { warnings?: string[] }>;
  renderCatchUp(data: CatchUp): string;
  resolveNotePath(project: string, conductor: string): string | undefined;
  readNote(notePath: string): string | undefined;
  writeStateBlock(notePath: string, body: string, marker: Marker): void;
  clickup(keys: string[]): Promise<ClickUpInfo[]>;
  now(): Date;
}

export interface CatchUpOptions {
  project: string;
  conductor: string;
  identity: string;
  session: string;
  maxAgeMin: number;
  refresh?: boolean;
  noWrite?: boolean;
}

export interface CatchUpResult {
  text: string;
  reused: boolean;
  noteWritten: boolean;
  warnings: string[];
}

export { catchUpMarker };

export function readCatchUpBlock(note: string, identity: string): { written: string; text: string } | undefined {
  let match;
  try {
    match = extractBlock(note, catchUpMarker(identity));
  } catch {
    return undefined; // a damaged block is not reused; the next write reports it
  }
  if (!match.found) return undefined;
  const inner = match.body.replace(/^\n/, "").replace(/\n$/, "");
  const m = /^Written: (\S+)\n([\s\S]*)$/.exec(inner);
  return m ? { written: m[1], text: m[2] } : undefined;
}

async function withClickUp<T extends StatePart>(state: T, deps: CatchUpDeps): Promise<T> {
  if (state.done.length === 0) return state;
  let info: ClickUpInfo[];
  try {
    info = await deps.clickup(state.done.map((d) => d.key));
  } catch {
    return { ...state, health: { ...state.health, server: `${state.health.server}; ClickUp unreachable` } };
  }
  const byKey = new Map(info.map((i) => [i.key, i]));
  const done = state.done.map((d) => {
    const i = byKey.get(d.key);
    return i?.status ? { ...d, line: `${d.line} (ClickUp: ${i.status})` } : d;
  });
  const unresolved = info.filter((i) => i.unresolved).map((i) => i.key);
  const server = unresolved.length ? `${state.health.server}; ClickUp unresolved: ${unresolved.join(", ")}` : state.health.server;
  return { ...state, done, health: { ...state.health, server } };
}

export async function buildCatchUp(opts: CatchUpOptions, deps: CatchUpDeps): Promise<CatchUpResult> {
  const now = deps.now();
  const warnings: string[] = [];
  const notePath = deps.resolveNotePath(opts.project, opts.conductor);
  if (!notePath) warnings.push(`conductor note not found for ${opts.project}/${opts.conductor}: catch-up not written`);

  if (notePath && !opts.refresh) {
    const note = deps.readNote(notePath);
    const block = note === undefined ? undefined : readCatchUpBlock(note, opts.identity);
    const writtenMs = block ? Date.parse(block.written) : NaN;
    if (block && !Number.isNaN(writtenMs) && now.getTime() - writtenMs >= 0 && now.getTime() - writtenMs <= opts.maxAgeMin * 60_000) {
      return { text: `${block.text}\n\n(from note, written ${block.written})`, reused: true, noteWritten: false, warnings };
    }
  }

  const cards = deps.listCards(opts.project) as WindowCard[];
  const window = computeWindow({ cards, identity: opts.identity, askingSession: opts.session, now });
  const state = await withClickUp(await deps.collectState({ project: opts.project, conductor: opts.conductor, since: window.from, notePath }), deps);
  const data: CatchUp = {
    done: state.done, running: state.running, waiting: state.waiting, decided: state.decided, parked: state.parked, next: state.next, health: state.health,
    conductor: opts.conductor, window: { from: window.from, to: window.to }, identity: opts.identity, askedBy: opts.session,
  };
  for (const w of state.warnings ?? []) warnings.push(w);
  const text = deps.renderCatchUp(data);

  let noteWritten = false;
  if (notePath && !opts.noWrite) {
    try {
      deps.writeStateBlock(notePath, `Written: ${toUtc7(now)}\n${text}`, catchUpMarker(opts.identity));
      noteWritten = true;
    } catch (err) {
      warnings.push(`catch-up note write failed: ${(err as Error).message}`);
    }
  }
  return { text, reused: false, noteWritten, warnings };
}
