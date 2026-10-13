// Catch-up behaviour (DGS-428, design section 7): window, collect, render, write ONE block per
// identity into the conductor's note. Dependencies are injected; deps-stub.ts holds the real
// ones until DGS-417, 422 and 427 merge.
import { computeWindow, toUtc7, type WindowCard } from "./catch-up-window.ts";
import type { CardRow, CatchUp, StatePart } from "./deps-stub.ts";

export interface ClickUpInfo {
  key: string;
  status?: string;
  unresolved?: boolean;
}

export interface CatchUpDeps {
  listCards(project: string): CardRow[];
  collectState(opts: { project: string; conductor: string; since: string; notePath?: string }): Promise<StatePart>;
  renderCatchUp(data: CatchUp): string;
  resolveNotePath(project: string, conductor: string): string | undefined;
  readNote(notePath: string): string | undefined;
  writeStateBlock(notePath: string, text: string, marker: { open: string; close: string }): void;
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

export function catchUpMarker(identity: string): { open: string; close: string } {
  return {
    open: `<!-- digismith:catch-up v1 maestro=${identity} -->`,
    close: `<!-- /digismith:catch-up maestro=${identity} -->`,
  };
}

export function readCatchUpBlock(note: string, identity: string): { written: string; text: string } | undefined {
  const { open, close } = catchUpMarker(identity);
  const start = note.indexOf(open);
  if (start === -1) return undefined;
  const end = note.indexOf(close, start);
  if (end === -1) return undefined;
  const inner = note.slice(start + open.length, end).replace(/^\n/, "").replace(/\n$/, "");
  const m = /^Written: (\S+)\n([\s\S]*)$/.exec(inner);
  return m ? { written: m[1], text: m[2] } : undefined;
}

async function withClickUp(state: StatePart, deps: CatchUpDeps): Promise<StatePart> {
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
  const data: CatchUp = { ...state, conductor: opts.conductor, window: { from: window.from, to: window.to }, identity: opts.identity, askedBy: opts.session };
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
