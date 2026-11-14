// Refresh the guide cache from ClickUp list F.9. See DGS-785 spec D1 (adoption), D3 (cache, lock). All I/O through cache.ts and the client.
import type { ClickUpClient } from "@digismith/clickup-client";
import {
  readIndex,
  readPage,
  releaseLock,
  takeLock,
  writeIndexAtomic,
  writePageAtomic,
  type GuideIndex,
  type GuideIndexEntry,
} from "./cache.ts";
import { assignSlugs, cleanPage, isAdopted, whenToUse } from "./parse.ts";

/** The part of the ClickUp client that refresh uses. */
export type RefreshClient = Pick<ClickUpClient, "getListTasks" | "getTaskByRef">;

export interface RefreshOptions {
  env?: NodeJS.ProcessEnv;
  now?: number;
  listId: string;
}

export type RefreshResult = { skipped: "locked" } | { changed: number; failed: number; total: number; failures: { key: string; message: string }[] };

type ListTask = Awaited<ReturnType<RefreshClient["getListTasks"]>>[number] & { markdown_description?: string };
interface Candidate {
  key: string;
  name: string;
  task: ListTask;
}

/** Rebuild index.json and pages/ from the adopted guides. Rejects when the list call fails; a per-task failure only counts. */
export async function refreshGuides(client: RefreshClient, opts: RefreshOptions): Promise<RefreshResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  if (!takeLock(now, env)) return { skipped: "locked" };
  try {
    const tasks = await client.getListTasks(opts.listId, {
      params: { include_closed: true, subtasks: true, include_markdown_description: true },
    });
    const candidates: Candidate[] = [];
    for (const task of tasks) {
      if (task.custom_id === null || task.custom_id === undefined) continue;
      if (!isAdopted(task.text_content ?? "")) continue;
      candidates.push({ key: task.custom_id, name: task.name, task });
    }
    const old = new Map((readIndex(env)?.guides ?? []).map((g) => [g.key, g]));
    const guides: GuideIndexEntry[] = [];
    let changed = 0;
    const failures: { key: string; message: string }[] = [];
    const slugged = assignSlugs(candidates);
    const newSlugs = new Set(slugged.map((s) => s.slug));
    for (const s of slugged) {
      const task = s.task.task;
      const prev = old.get(s.key);
      if (prev !== undefined && prev.slug === s.slug && prev.updated === task.date_updated && readPage(s.slug, env) !== undefined) {
        guides.push({ ...prev, name: s.name, kind: s.kind });
        continue;
      }
      try {
        const markdown =
          task.markdown_description ?? ((await client.getTaskByRef(s.key, { include_markdown_description: true })) as ListTask).markdown_description ?? "";
        if (!isAdopted(markdown)) continue;
        writePageAtomic(s.slug, cleanPage(markdown), env);
        guides.push({ slug: s.slug, key: s.key, id: task.id, kind: s.kind, name: s.name, when: whenToUse(markdown), updated: task.date_updated });
        changed++;
      } catch (err) {
        failures.push({ key: s.key, message: err instanceof Error ? err.message : String(err) });
        // keep the old entry under its OLD slug: its page file is there. Omit it when another guide now owns that slug.
        if (prev !== undefined && (prev.slug === s.slug || !newSlugs.has(prev.slug))) guides.push({ ...prev, name: s.name, kind: s.kind });
      }
    }
    const index: GuideIndex = { version: 1, fetched_at: new Date(now).toISOString(), list_id: opts.listId, guides };
    writeIndexAtomic(index, env);
    return { changed, failed: failures.length, total: guides.length, failures };
  } finally {
    releaseLock(env);
  }
}
