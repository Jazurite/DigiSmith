import type { AttachedRecord } from "../tokens/attachments-store.ts";

export type AttachDecision =
  | { action: "skip"; reason: "unchanged" }
  | { action: "upload"; supersedes?: string; warn?: string };

export function decideAttach(a: { name: string; sha256: string; recorded: AttachedRecord[]; onTask: { id: string; title: string }[] }): AttachDecision {
  const rec = a.recorded.find((r) => r.name === a.name);
  const live = rec !== undefined && a.onTask.some((t) => t.id === rec.id);
  if (rec && live && rec.sha256 === a.sha256) return { action: "skip", reason: "unchanged" };
  if (rec && live) return { action: "upload", supersedes: rec.id };
  if (rec && a.onTask.some((t) => t.title === a.name)) return { action: "upload", warn: "a same-titled attachment is already on the task" };
  if (!rec && a.onTask.some((t) => t.title === a.name)) return { action: "upload", warn: "same-named attachment on the task is unknown to the depot" };
  return { action: "upload" };
}
