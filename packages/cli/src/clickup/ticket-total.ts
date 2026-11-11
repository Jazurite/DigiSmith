import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";
import { collectRecords } from "../tokens/count.ts";
import { applyBlock, renderBlock, sentinelCounts, type BlockRow, type BlockTotals } from "../tokens/hallmark-block.ts";
import { createDepotRegistry } from "../tokens/registry.ts";
import { priceOf, taskUsage, windowBounds } from "../tokens/stamp.ts";
import { readStamps } from "../tokens/stamps-store.ts";
import { addCounts, emptyCounts, type Counts } from "../tokens/types.ts";

const CLICKUP_KEY = /^DGS-\d+$/;
const failure = (msg: string) => `warn: ${msg.replace(/\s*\n\s*/g, " ")}`;
const taskOrder = (a: string, b: string) => (a === "final" ? 1 : b === "final" ? -1 : Number(a) - Number(b) || a.localeCompare(b));

interface Desc { description?: string | null; markdown_description?: string | null }

function rowsFor(key: string, data: ReturnType<typeof collectRecords>): BlockRow[] {
  const latest = new Map(readStamps(key).map((s) => [s.task, s])); // a later line wins
  const ids = new Set<string>(latest.keys());
  for (const e of data.entries) if (e.kind === "task_end") ids.add(e.task);
  return [...ids].sort(taskOrder).map((task): BlockRow => {
    const s = latest.get(task);
    // Time always comes from the transcripts and registry (active time), never from the stored wall-clock figure.
    // A stamped task with no closed registry window keeps its stored seconds and shows no Window. The stamp supplies reviews, findings, fix rounds, partial and cost.
    const u = taskUsage(data.records, data.entries, undefined, task, data.ticketSessions);
    const wb = windowBounds(u.windows);
    const windowStart = wb?.start;
    const windowEnd = wb?.end;
    if (s) {
      const costs = Object.values(s.models).map((m) => m.cost_usd);
      // The stamps file stores 0 for missing review data; the source says what was really recorded.
      const none = s.reviews.source === "none";
      const rv = s.reviews;
      return { task, agentSeconds: wb ? u.agentSeconds : s.agent_seconds, windowStart, windowEnd, cost_usd: costs.some((c) => c === null) ? null : costs.reduce((a: number, c) => a + (c as number), 0), rounds: none ? null : rv.rounds, findings: none ? null : rv.findings, fixRounds: none || rv.source === "findings.md" ? null : rv.fix_rounds, stamped: true, partial: s.partial };
    }
    // No stamp: window and cost come from the registry and transcripts only. The ledger is gone by now,
    // so the "dispatch ... agent=<id>" rule cannot apply and subagent responses outside the window are missed.
    return { task, agentSeconds: u.agentSeconds, windowStart, windowEnd, cost_usd: u.total.cost_usd, rounds: null, findings: null, fixRounds: null, stamped: false };
  });
}

// Whole ticket: every response of the ticket's own sessions (unattributed ones are left out), priced per response.
function totalsFor(data: ReturnType<typeof collectRecords>): BlockTotals {
  const own = new Set(data.ticketSessions);
  let counts: Counts = emptyCounts();
  let cost = 0;
  let unpriced = false;
  for (const r of data.records) {
    if (!own.has(r.session_id)) continue;
    counts = addCounts(counts, { input: r.input, output: r.output, cache_read: r.cache_read, cache_write_5m: r.cache_write_5m, cache_write_1h: r.cache_write_1h, responses: 1 });
    const p = priceOf(r);
    if (p === null) unpriced = true; else cost += p;
  }
  return { counts, cost_usd: cost, unpriced };
}

export function createTicketTotalCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "ticket-total",
    describe: "write the Hallmark totals block into a ticket's description; a dry run unless --yes",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-546)" })
        .option("yes", { type: "boolean", default: false, describe: "write the description (without it, only print it)" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const key = String(argv.task ?? "").trim();
        if (!CLICKUP_KEY.test(key)) {
          console.log("not a ClickUp key, skipped");
          return;
        }
        const data = collectRecords({ ticket: key, registry: createDepotRegistry() });
        const rows = rowsFor(key, data);
        const totals = totalsFor(data);
        if (rows.length === 0 && totals.counts.responses === 0) throw new Error(`no tasks and no responses for ${key}, refusing to write an empty block`);
        const block = renderBlock(rows, totals, { missing: data.missingSessions.length });

        const client = clientFactory();
        const read = async () => (await client.getTaskByRef(key, { include_markdown_description: true })) as unknown as { id: string } & Desc;
        const task = await read();
        const md = task.markdown_description ?? "";
        if (md === "" && (task.description ?? "") !== "") throw new Error(`${key} has a description but no markdown_description, refusing to write (it would flatten the text)`);
        const next = applyBlock(md, block);
        const body = { markdown_description: next };
        if (!argv.yes) {
          console.log(next);
          printCall("PUT", `/task/${task.id}`, body);
          console.log("nothing sent; add --yes to send");
          return;
        }
        await client.updateTask(task.id, body);
        // Never a second write in this run, whatever the read-back shows.
        let back: Desc;
        try {
          back = await read();
        } catch (err) {
          throw new Error(`written, but the read-back failed: ${(err as Error).message}; not writing again, check the description`);
        }
        const seen = sentinelCounts(back.markdown_description ?? back.description ?? "");
        if (seen.start !== 1 || seen.end !== 1 || seen.legacy !== 0) throw new Error(`written, but the read-back does not hold both Hallmark sentinels exactly once (or still holds an old one); not writing again, check the description`);
        console.log(`written to ${key}`);
      } catch (err) {
        console.error(failure((err as Error).message));
        process.exitCode = 1;
      }
    },
  };
}

export const ticketTotalCommand: CommandModule = createTicketTotalCommand();
