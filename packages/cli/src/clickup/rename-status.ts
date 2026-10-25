import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorStatus, FrontdoorStatusSetBody } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";
import { RANK, TYPES, checkStatusSet } from "./add-status.ts";

export interface StatusRename {
  from: string;
  to: string;
  /** Without a type the status keeps its current one. */
  type?: string;
  /** Put the renamed status right after (or right before) this status; not both. Without either it stays in place. */
  after?: string;
  before?: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The PUT replaces the WHOLE set: every status as read (id and every field kept), the renamed one with its new name (and
 * type) at its new place, orderindex re-numbered dense from 0. No status_change_map: nothing is removed.
 * The type order open, unstarted, custom, done, closed is checked for the renamed status against its new neighbours,
 * with the renamed status taken out of the list.
 */
export function planStatusRename(current: FrontdoorStatus[], rename: StatusRename): FrontdoorStatusSetBody {
  checkStatusSet(current, "the renamed status");
  const to = rename.to.trim();
  if (!to) throw new Error("--to must not be empty");
  if (rename.type !== undefined && !TYPES.includes(rename.type)) throw new Error(`--type must be one of ${TYPES.join(", ")}`);
  if (rename.after !== undefined && rename.before !== undefined) throw new Error("--after and --before cannot be used together");
  const sorted = [...current].sort((x, y) => x.orderindex - y.orderindex);
  const at = sorted.findIndex((s) => same(s.status, rename.from));
  if (at === -1) throw new Error(`--from "${rename.from}" is not a status of this set; the statuses are: ${sorted.map((s) => s.status).join(", ")}`);
  const target = sorted[at];
  const clash = sorted.find((s) => s !== target && same(s.status, to));
  if (clash) throw new Error(`status "${clash.status}" already exists in this set; --to must be a new name`);
  const type = rename.type ?? target.type;
  const rest = sorted.filter((s) => s !== target);
  if ((type === "open" || type === "closed") && rest.some((s) => s.type === type)) {
    throw new Error(`the set already has a ${type} status; only one is kept`);
  }
  let index = at;
  const anchor = rename.after !== undefined ? rename.after : rename.before;
  if (anchor !== undefined) {
    const flag = rename.after !== undefined ? "--after" : "--before";
    const hit = rest.findIndex((s) => same(s.status, anchor));
    if (hit === -1) {
      throw new Error(`${flag} "${anchor}" is not a status of this set (the renamed status cannot be its own anchor); the others are: ${rest.map((s) => s.status).join(", ")}`);
    }
    index = rename.after !== undefined ? hit + 1 : hit;
  }
  const left = rest[index - 1];
  const right = rest[index];
  const rank = RANK[type];
  if ((left && RANK[left.type] > rank) || (right && RANK[right.type] < rank)) {
    const side = (s: FrontdoorStatus | undefined) => (s ? `"${s.status}" (${s.type})` : "nothing");
    throw new Error(
      `a ${type} status cannot go between ${side(left)} and ${side(right)}: the types must stay in the order open, unstarted, custom, done, closed`
    );
  }
  if (to === target.status && type === target.type && index === at) {
    throw new Error(`nothing to change: "${target.status}" already has this name, type and place`);
  }
  const renamed: FrontdoorStatus = { ...target, status: to, type };
  const statuses = [...rest.slice(0, index), renamed, ...rest.slice(index)].map((s, i) => ({ ...s, orderindex: i }));
  return { statuses };
}

function printSet(statuses: FrontdoorStatus[], renamedId: string | undefined): void {
  for (const s of statuses) {
    const mark = s.id === renamedId ? "   <- RENAMED" : "";
    console.log(`${String(s.orderindex).padStart(2)} ${s.status.padEnd(16)} ${s.type.padEnd(9)} ${s.color}${mark}`);
  }
}

/**
 * After the PUT, compared with the plan: same count, same id set, every status (by id) with the planned name, type,
 * color and orderindex (the renamed one included).
 */
function verify(planned: FrontdoorStatus[], previous: FrontdoorStatus[], after: FrontdoorStatus[]): string[] {
  const problems: string[] = [];
  if (after.length !== previous.length) problems.push(`COUNT is ${after.length}, expected ${previous.length}`);
  const plannedIds = new Set(planned.map((p) => p.id));
  for (const p of planned) {
    const now = after.find((s) => s.id === p.id);
    if (!now) problems.push(`LOST status "${p.status}" (${p.id})`);
    else if (now.status !== p.status || now.type !== p.type || now.color !== p.color || now.orderindex !== p.orderindex) {
      problems.push(
        `CHANGED status "${p.status}" (${p.id}): now "${now.status}" ${now.type} ${now.color} #${now.orderindex}, ` +
          `planned "${p.status}" ${p.type} ${p.color} #${p.orderindex}`
      );
    }
  }
  for (const s of after.filter((x) => !plannedIds.has(x.id))) problems.push(`UNEXPECTED status "${s.status}" (${s.id})`);
  return problems;
}

export function createRenameStatusCommand(frontdoorFactory: () => FrontdoorClient = createFrontdoorClient): CommandModule {
  return {
    command: "rename-status",
    describe: "rename a status of a space's status set, keeping its id, optionally changing its type and place (Frontdoor; space level only); a dry run unless --yes",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id" })
        .option("from", { type: "string", requiresArg: true, demandOption: true, describe: "current status name" })
        .option("to", { type: "string", requiresArg: true, demandOption: true, describe: "new status name" })
        .option("type", { type: "string", requiresArg: true, choices: TYPES, describe: "new status type (default: keep the current one)" })
        .option("after", { type: "string", requiresArg: true, conflicts: "before", describe: "move the status right after this status" })
        .option("before", { type: "string", requiresArg: true, conflicts: "after", describe: "move the status right before this status" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const space = argv.space as string | undefined;
        if (space === undefined || !/^\d+$/.test(space)) throw new Error("--space must be the numeric space id");
        const rename: StatusRename = {
          from: argv.from as string, to: argv.to as string, type: argv.type as string | undefined,
          after: argv.after as string | undefined, before: argv.before as string | undefined,
        };
        const fd = frontdoorFactory();
        const previous = await fd.getSpaceStatuses(space);
        const body = planStatusRename(previous, rename);
        const path = `/hierarchy/v1/project/${space}/status?checkConflict=true`;
        const renamedId = previous.find((s) => same(s.status, rename.from))?.id;
        if (!argv.yes) {
          printCall("PUT", path, undefined);
          printSet(body.statuses, renamedId);
          console.log(JSON.stringify(body, null, 2));
          console.log("a real rename replaces the whole status set: needs Jack's yes");
          console.log("nothing sent; add --yes to send");
          process.exitCode = 0;
          return;
        }
        // The PUT replaces the whole set: keep the full previous set in the output, so a manual restore is possible.
        const previousJson = JSON.stringify(previous, null, 2);
        console.log("previous status set (restore from this if needed):");
        console.log(previousJson);
        try {
          await fd.putSpaceStatuses(space, body);
        } catch (err) {
          const code = (err as { response?: { status?: number } }).response?.status;
          const hint = code !== undefined && code >= 400 && code < 500 ? " (re-run to read the current set)" : "";
          console.error(`clickup rename-status: ${(err as Error).message}${hint}`);
          process.exitCode = 1;
          return;
        }
        let problems: string[];
        let readBack: FrontdoorStatus[];
        try {
          readBack = await fd.getSpaceStatuses(space);
          problems = verify(body.statuses, previous, readBack);
        } catch (err) {
          console.error(
            `clickup rename-status: the PUT WAS SENT, verification failed (${(err as Error).message}): ` +
              "re-read the set with GET and compare with the previous set above"
          );
          process.exitCode = 1;
          return;
        }
        if (problems.length > 0) {
          console.error(`clickup rename-status: THE STATUS SET IS NOT AS PLANNED after the PUT:\n${problems.join("\n")}`);
          console.log("previous status set (for a manual restore):");
          console.log(previousJson);
          process.exitCode = 1;
          return;
        }
        console.log(`status renamed: ${rename.from.trim()} -> ${rename.to.trim()}`);
        console.log("the set as read back:");
        for (const s of [...readBack].sort((x, y) => x.orderindex - y.orderindex)) {
          console.log(`${String(s.orderindex).padStart(2)} ${s.status.padEnd(16)} ${s.type}`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup rename-status: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const renameStatusCommand: CommandModule = createRenameStatusCommand();
