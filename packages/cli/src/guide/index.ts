// `dg guide`: list, show and refresh the guide index from ClickUp list F.9. See DGS-785 spec (commands, offline, 8-second limit, exit codes).
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "../clickup/lib.ts";
import { readIndex, readPage, releaseLock, writePageAtomic, type GuideIndex, type GuideIndexEntry } from "./cache.ts";
import { resolveGuide } from "./lookup.ts";
import { cleanPage, isAdopted } from "./parse.ts";
import { refreshGuides } from "./refresh.ts";

const LIST_ID = "1301150000002968";
const LIMIT_MS = 8_000;

/** Replace `Bearer <anything>` and pk_/sk- tokens so no secret reaches the terminal. */
export function scrub(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "***").replace(/\b(?:pk_|sk-)[\w-]*/g, "***");
}

function errText(err: unknown): string {
  return scrub(err instanceof Error ? err.message : String(err));
}

interface LimitState {
  hit: boolean;
}
type Exit = (code: number) => void;
const EXIT_GRACE_MS = 200;

/** After a timeout a hung socket can keep the process alive: end it shortly, only if something still holds the loop. */
function endAfterTimeout(state: LimitState, exit: Exit): void {
  if (state.hit) setTimeout(() => exit(Number(process.exitCode ?? 1)), EXIT_GRACE_MS).unref();
}

/** Reject after the limit; the underlying call is left to finish or die with the process. */
async function withLimit<T>(work: Promise<T>, state: LimitState, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      state.hit = true;
      onTimeout?.();
      reject(new Error(`ClickUp did not answer within ${LIMIT_MS / 1000} seconds`));
    }, LIMIT_MS);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** "2026-11-14 17:00 UTC+7" from an ISO time. */
export function formatUtc7(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return `${new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} UTC+7`;
}

function cacheNotice(index: GuideIndex): string {
  return `guide: ClickUp unreachable, using cache from ${formatUtc7(index.fetched_at)}`;
}

type Factory = () => ClickUpClient;
const defaultExit: Exit = (code) => process.exit(code);

function printList(guides: GuideIndexEntry[], json: boolean): void {
  if (json) console.log(JSON.stringify(guides, null, 2));
  else for (const g of guides) console.log(`${g.slug}\t${g.key}\t${g.when}`);
}

export function createGuideListCommand(clientFactory: Factory = createClient, exit: Exit = defaultExit): CommandModule {
  return {
    command: "list",
    describe: "list the guides and manuals (slug, key, when to use)",
    builder: (y) =>
      y
        .option("json", { type: "boolean", describe: "print the guides as JSON" })
        .option("offline", { type: "boolean", describe: "use the cache, make no ClickUp call" }),
    handler: async (argv) => {
      const json = argv.json === true;
      const state: LimitState = { hit: false };
      try {
        if (argv.offline === true) {
          const index = readIndex();
          if (index === undefined) {
            console.error("guide list: no cache");
            process.exitCode = 1;
            return;
          }
          printList(index.guides, json);
          process.exitCode = 0;
          return;
        }
        try {
          // a skipped (locked) refresh is fine: the cache is current enough
          await withLimit(refreshGuides(clientFactory(), { listId: LIST_ID }), state, () => releaseLock());
          const fresh = readIndex();
          if (fresh !== undefined) {
            printList(fresh.guides, json);
            process.exitCode = 0;
            return;
          }
        } catch {
          const index = readIndex();
          if (index !== undefined) {
            console.error(cacheNotice(index));
            printList(index.guides, json);
            process.exitCode = 0;
            return;
          }
        }
        console.error("guide list: ClickUp unreachable and no cache");
        process.exitCode = 1;
      } finally {
        endAfterTimeout(state, exit);
      }
    },
  };
}

export function createGuideRefreshCommand(clientFactory: Factory = createClient): CommandModule {
  return {
    command: "refresh",
    describe: "rewrite the guide cache from ClickUp",
    builder: (y) => y.option("quiet", { type: "boolean", describe: "print nothing" }),
    handler: async (argv) => {
      const quiet = argv.quiet === true;
      try {
        const result = await refreshGuides(clientFactory(), { listId: LIST_ID });
        if (!quiet) {
          if ("skipped" in result) console.log("guides: refresh already running, skipped");
          else {
            for (const f of result.failures) console.error(`guide: failed ${f.key}: ${scrub(f.message)}`);
            console.log(`guides: ${result.total} (${result.changed} changed)`);
          }
        }
        process.exitCode = 0;
      } catch (err) {
        if (!quiet) console.error(`guide refresh: ${errText(err)}`);
        process.exitCode = 1;
      }
    },
  };
}

function lookupFailure(name: string, guides: GuideIndexEntry[]): boolean {
  const r = resolveGuide(guides, name);
  if (r.kind === "ambiguous") {
    console.error(`guide: "${name}" matches: ${r.matches.join(", ")}`);
    process.exitCode = 2;
    return true;
  }
  if (r.kind === "unknown") {
    console.error(`guide: no guide "${name}".${r.closest.length > 0 ? ` Closest: ${r.closest.join(", ")}` : ""}`);
    process.exitCode = 2;
    return true;
  }
  return false;
}

export function createGuideShowCommand(clientFactory: Factory = createClient, exit: Exit = defaultExit): CommandModule {
  return {
    command: "$0 [name]",
    describe: "print a guide page as Markdown",
    builder: (y) => y.positional("name", { type: "string", describe: "slug, key or unique slug prefix" }),
    handler: async (argv) => {
      const state: LimitState = { hit: false };
      try {
        await show(argv, state);
      } finally {
        endAfterTimeout(state, exit);
      }
    },
  };

  async function show(argv: Record<string, unknown>, state: LimitState): Promise<void> {
      const name = typeof argv.name === "string" ? argv.name : "";
      if (name === "") {
        console.error("guide: usage: dg guide <name> | list | refresh");
        process.exitCode = 1;
        return;
      }
      let index = readIndex();
      let client: ClickUpClient | undefined;
      try {
        client = clientFactory();
        if (index === undefined) {
          await withLimit(refreshGuides(client, { listId: LIST_ID }), state, () => releaseLock());
          index = readIndex();
        }
      } catch {
        // ClickUp unreachable: fall through to the cache
      }
      const down = (): void => {
        const cached = index === undefined ? undefined : resolveGuide(index.guides, name);
        const page = cached?.kind === "found" ? readPage(cached.guide.slug) : undefined;
        if (index !== undefined && page !== undefined) {
          console.error(cacheNotice(index));
          console.log(page);
          process.exitCode = 0;
        } else {
          console.error(`guide: ClickUp unreachable and no cached page for "${name}"`);
          process.exitCode = 1;
        }
      };
      if (index === undefined) return down();
      if (lookupFailure(name, index.guides)) return;
      const found = resolveGuide(index.guides, name);
      if (found.kind !== "found" || client === undefined) return down();
      const guide = found.guide;
      try {
        const task = (await withLimit(client.getTaskByRef(guide.key, { include_markdown_description: true }), state)) as { markdown_description?: string };
        const markdown = task.markdown_description ?? "";
        if (!isAdopted(markdown)) {
          // Exits 2, but the guide stays in the index and page cache until the next refresh drops it.
          lookupFailure(name, index.guides.filter((g) => g.slug !== guide.slug));
          if (process.exitCode !== 2) {
            console.error(`guide: no guide "${name}".`);
            process.exitCode = 2;
          }
          return;
        }
        const page = cleanPage(markdown);
        try {
          writePageAtomic(guide.slug, page);
        } catch {
          // a cache write failure never blocks printing
        }
        console.log(page);
        process.exitCode = 0;
      } catch {
        down();
      }
  }
}

export function createGuideCommand(clientFactory: Factory = createClient): CommandModule {
  return {
    command: "guide",
    describe: "guide index from ClickUp list F.9: dg guide <name> | list | refresh",
    builder: (y) =>
      y.command(createGuideListCommand(clientFactory)).command(createGuideRefreshCommand(clientFactory)).command(createGuideShowCommand(clientFactory)),
    handler: () => {},
  };
}

const guideCommand: CommandModule = createGuideCommand();
export default guideCommand;
