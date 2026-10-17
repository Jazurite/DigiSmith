import { newState, writeState } from "./state.ts";
import type { Candidate, ListTarget, Tracker } from "./tracker.ts";

export const TYPES = ["Task", "Bug", "Spike", "Epic", "Initiative"] as const;
export type ModelRunner = (prompt: string) => Promise<string>;

export interface ModelPick { duplicate_of: string | null; list: string; type: string; title: string }
export interface FileDeps { tracker: Tracker; runModel: ModelRunner; dir: string; now: () => Date }

export function buildPrompt(idea: string, targets: ListTarget[], candidates: Candidate[]): string {
  const lists = targets.map((t) => `- id ${t.id}: ${t.name} (folder ${t.folder || "none"})${t.description ? ` - ${t.description}` : ""}`).join("\n");
  const open = candidates.length ? candidates.map((c) => `- ${c.key}: ${c.name} [${c.status}, ${c.list}]`).join("\n") : "- none";
  return [
    "You file ideas into a ClickUp backlog. Answer with one JSON object and nothing else.",
    'Shape: {"duplicate_of": "<KEY or null>", "list": "<list id>", "type": "Task|Bug|Spike|Epic|Initiative", "title": "<short ticket title>"}',
    "Rules:",
    "- duplicate_of is a key from the open tickets below only when the idea is the same work. Otherwise null.",
    "- list is an id from the lists below. Pick the clan and lineage whose name fits best.",
    "- If no lineage fits, pick the clan's .0 Pavilion list. Agentic spikes and experiments go to clan B.",
    "- type: Bug for a defect, Spike for research or an experiment, Epic or Initiative only for a large body of work, else Task.",
    "",
    `Idea: ${idea}`,
    "",
    "Lists:",
    lists,
    "",
    "Open tickets that look similar:",
    open,
  ].join("\n");
}

export function parsePick(raw: string, targets: ListTarget[], candidates: Candidate[]): ModelPick {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const v = JSON.parse(body) as Record<string, unknown>;
  if (typeof v !== "object" || v === null) throw new Error("model output is not an object");
  const { duplicate_of, list, type, title } = v;
  if (typeof list !== "string" || !targets.some((t) => t.id === list)) throw new Error(`model picked an unknown list: ${String(list)}`);
  if (typeof type !== "string" || !(TYPES as readonly string[]).includes(type)) throw new Error(`model picked an unknown type: ${String(type)}`);
  if (typeof title !== "string" || title.trim() === "") throw new Error("model gave no title");
  if (duplicate_of !== null && (typeof duplicate_of !== "string" || !candidates.some((c) => c.key === duplicate_of))) {
    throw new Error(`model named an unknown duplicate: ${String(duplicate_of)}`);
  }
  return { duplicate_of: duplicate_of as string | null, list, type, title: title.trim() };
}

export async function fileIdea(deps: FileDeps, idea: string, opts: { type?: string } = {}): Promise<string[]> {
  if (idea.trim() === "") throw new Error("idea is empty");
  if (opts.type !== undefined && !(TYPES as readonly string[]).includes(opts.type)) throw new Error(`type must be one of ${TYPES.join(", ")}`);
  const [targets, candidates] = await Promise.all([deps.tracker.listTargets(), deps.tracker.findCandidates(idea)]);

  let pick: ModelPick | null = null;
  let failure = "";
  try {
    pick = parsePick(await deps.runModel(buildPrompt(idea, targets, candidates)), targets, candidates);
  } catch (err) {
    failure = (err as Error).message;
  }

  if (pick?.duplicate_of) {
    const dup = candidates.find((c) => c.key === pick!.duplicate_of)!;
    return [`steward: duplicate of ${dup.key} (${dup.name}); nothing filed`];
  }

  let listId: string;
  let name: string;
  let type: string;
  if (pick) {
    listId = pick.list;
    name = pick.title;
    type = opts.type ?? pick.type;
  } else {
    const pavilion = targets.find((t) => /^B\.0\b/.test(t.name));
    if (!pavilion) throw new Error(`model call failed (${failure}) and there is no B.0 Pavilion to file into`);
    listId = pavilion.id;
    name = idea.trim().split("\n")[0].slice(0, 120);
    type = opts.type ?? "Task";
  }

  const created = await deps.tracker.createTicket({ listId, name, type, description: idea.trim() });
  const st = newState(created.key, "clickup");
  st.status_written = "backlog";
  st.status_seen = "backlog";
  st.log.push({ at: deps.now().toISOString(), event: "filed", by: "steward", outcome: "applied", note: `${listId} ${type}` });
  writeState(deps.dir, st);

  const where = targets.find((t) => t.id === listId)!.name;
  if (!pick) {
    await deps.tracker.addComment(created.key, `filed unsorted: model call failed (${failure}). Please re-sort.`);
    return [`steward: filed ${created.key} unsorted in ${where} as ${type} (backlog); the model call failed`];
  }
  return [`steward: filed ${created.key} in ${where} as ${type} (backlog)`];
}
