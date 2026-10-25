import type { ClickUpChecklistItem } from "@digismith/clickup-client";
import type { WantItem } from "./want.ts";

/** A checklist item as the diff needs it. */
export interface CurrentItem {
  id: string;
  name: string;
  resolved: boolean;
  parent: string | null;
}

export type ChecklistOp =
  | { kind: "add"; key: string; name: string; resolved: boolean; parentKey?: string }
  | { kind: "edit"; id: string; key: string; name?: string; resolved?: boolean }
  | { kind: "remove"; id: string; name: string };

export interface OpCounts {
  add: number;
  rename: number;
  remove: number;
  tick: number;
  untick: number;
}

export interface ChecklistDiff {
  ops: ChecklistOp[];
  counts: OpCounts;
  /** Items that are not ours (other names, unknown children): left alone. */
  foreign: number;
  /** Item key to the id of the current item that holds it. */
  matched: Map<string, string>;
}

const TASK_ITEM = /^Task (\d+):/;
const CHILD_PREFIX: [string, RegExp][] = [
  ["implement", /^Implement\b/],
  ["review", /^Review\b/],
  ["fix", /^Fix\b/],
];
const FINAL_PREFIX: [string, RegExp][] = [
  ["final.review", /^Whole-branch review\b/],
  ["final.fix", /^Whole-branch fixes\b/],
];

const isItem = (x: unknown): x is ClickUpChecklistItem => typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string";

/** Flat items with `parent` and nested `children` objects both read; each id once, first seen wins. */
export function flattenItems(items: ClickUpChecklistItem[]): CurrentItem[] {
  const out = new Map<string, CurrentItem>();
  const walk = (list: unknown[], parent: string | null) => {
    for (const raw of list) {
      if (!isItem(raw)) continue;
      if (!out.has(raw.id)) out.set(raw.id, { id: raw.id, name: raw.name, resolved: Boolean(raw.resolved), parent: raw.parent ?? parent });
      if (Array.isArray(raw.children)) walk(raw.children, raw.id);
    }
  };
  walk(items, null);
  return [...out.values()];
}

/** The writes that make the checklist equal `want`, matched by key; removes (children first), then edits, then adds. */
export function diffChecklist(current: CurrentItem[], want: WantItem[]): ChecklistDiff {
  const wanted = new Map(want.map((w) => [w.key, w]));
  const matched = new Map<string, string>();
  const keyOfId = new Map<string, string>();
  const removeChildren: ChecklistOp[] = [];
  const removeTop: ChecklistOp[] = [];
  const droppedParents = new Set<string>();
  let foreign = 0;

  for (const it of current.filter((i) => i.parent === null)) {
    const t = TASK_ITEM.exec(it.name);
    const key = t ? t[1] : FINAL_PREFIX.find(([, re]) => re.test(it.name))?.[0];
    if (key === undefined) {
      foreign++;
      continue;
    }
    if (!wanted.has(key) || matched.has(key)) {
      removeTop.push({ kind: "remove", id: it.id, name: it.name });
      if (t) droppedParents.add(it.id);
      continue;
    }
    matched.set(key, it.id);
    keyOfId.set(it.id, key);
  }
  for (const it of current.filter((i) => i.parent !== null)) {
    const part = CHILD_PREFIX.find(([, re]) => re.test(it.name))?.[0];
    const parentKey = keyOfId.get(it.parent!);
    if (part !== undefined && droppedParents.has(it.parent!)) {
      removeChildren.push({ kind: "remove", id: it.id, name: it.name });
      continue;
    }
    if (part === undefined || parentKey === undefined || parentKey.startsWith("final.")) {
      foreign++;
      continue;
    }
    const key = `${parentKey}.${part}`;
    if (matched.has(key)) {
      removeChildren.push({ kind: "remove", id: it.id, name: it.name });
      continue;
    }
    matched.set(key, it.id);
  }

  const byId = new Map(current.map((i) => [i.id, i]));
  const counts: OpCounts = { add: 0, rename: 0, remove: removeChildren.length + removeTop.length, tick: 0, untick: 0 };
  const edits: ChecklistOp[] = [];
  const adds: ChecklistOp[] = [];
  for (const w of want) {
    const id = matched.get(w.key);
    if (id === undefined) {
      adds.push(w.parentKey === undefined ? { kind: "add", key: w.key, name: w.name, resolved: w.resolved } : { kind: "add", key: w.key, name: w.name, resolved: w.resolved, parentKey: w.parentKey });
      counts.add++;
      if (w.resolved) counts.tick++;
      continue;
    }
    const have = byId.get(id)!;
    const edit: { kind: "edit"; id: string; key: string; name?: string; resolved?: boolean } = { kind: "edit", id, key: w.key };
    if (have.name !== w.name) {
      edit.name = w.name;
      counts.rename++;
    }
    if (have.resolved !== w.resolved) {
      edit.resolved = w.resolved;
      if (w.resolved) counts.tick++;
      else counts.untick++;
    }
    if (edit.name !== undefined || edit.resolved !== undefined) edits.push(edit);
  }
  return { ops: [...removeChildren, ...removeTop, ...edits, ...adds], counts, foreign, matched };
}
