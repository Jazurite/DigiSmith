import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorStatus, FrontdoorStatusSetBody } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const TYPES = ["custom", "done", "open", "closed"];
const DEFAULT_COLOR = "#87909e";

export interface StatusAdd {
  name: string;
  type: string;
  color: string;
  /** Place the new status right after (or right before) this existing status; not both. */
  after?: string;
  before?: string;
}

const RANK: Record<string, number> = { open: 0, custom: 1, done: 2, closed: 3 };

/**
 * The PUT replaces the WHOLE set, so the body is every current status untouched (all fields as read, id kept) plus the
 * new one (no id), placed right after --after / right before --before, or before the closed status without either; orderindex is re-numbered dense from 0 in the order of the read
 * sorted by orderindex (the relative order never changes). No status_change_map: nothing is removed.
 * An anchored place must keep the type order open, custom, done, closed (checked for the new status only).
 * Refuses what could make ClickUp lose or reorder a status: an empty set, a status without id, a missing or shared orderindex.
 */
export function planStatusAdd(current: FrontdoorStatus[], add: StatusAdd): FrontdoorStatusSetBody {
  if (current.length === 0) throw new Error("the current status set is empty; refusing to build a set with only the new status");
  for (const s of current) {
    if (!s.id) throw new Error(`status "${s.status}" has no id; sent back without one ClickUp may treat it as new`);
    if (typeof s.orderindex !== "number" || !Number.isFinite(s.orderindex)) {
      throw new Error(`status "${s.status}" has no orderindex; its place in the set is not known`);
    }
  }
  const seen = new Set<number>();
  for (const s of current) {
    if (seen.has(s.orderindex)) throw new Error(`two statuses have the same orderindex (${s.orderindex}); their order is not known`);
    seen.add(s.orderindex);
  }
  const name = add.name.trim();
  if (!name) throw new Error("--name must not be empty");
  if (!TYPES.includes(add.type)) throw new Error(`--type must be one of ${TYPES.join(", ")}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(add.color)) throw new Error("--color must look like #rrggbb");
  const clash = current.find((s) => s.status.toLowerCase() === name.toLowerCase());
  if (clash) throw new Error(`status "${clash.status}" already exists in this set`);
  if ((add.type === "open" || add.type === "closed") && current.some((s) => s.type === add.type)) {
    throw new Error(`the set already has a ${add.type} status; only one is kept (adding a second is not captured)`);
  }
  const sorted = [...current].sort((x, y) => x.orderindex - y.orderindex);
  const anchor = add.after !== undefined ? add.after : add.before;
  if (add.after !== undefined && add.before !== undefined) throw new Error("--after and --before cannot be used together");
  let index: number;
  if (anchor === undefined) {
    const at = sorted.findIndex((s) => s.type === "closed");
    index = at === -1 ? sorted.length : at;
  } else {
    const flag = add.after !== undefined ? "--after" : "--before";
    const hit = sorted.findIndex((s) => s.status.trim().toLowerCase() === anchor.trim().toLowerCase());
    if (hit === -1) {
      throw new Error(`${flag} "${anchor}" is not a status of this set; the statuses are: ${sorted.map((s) => s.status).join(", ")}`);
    }
    index = add.after !== undefined ? hit + 1 : hit;
    const left = sorted[index - 1];
    const right = sorted[index];
    const rank = RANK[add.type];
    if ((left && RANK[left.type] > rank) || (right && RANK[right.type] < rank)) {
      const side = (s: FrontdoorStatus | undefined) => (s ? `"${s.status}" (${s.type})` : "nothing");
      throw new Error(
        `a ${add.type} status cannot go between ${side(left)} and ${side(right)}: the types must stay in the order open, custom, done, closed`
      );
    }
  }
  const created: FrontdoorStatus = { status: name, type: add.type, orderindex: 0, color: add.color };
  const statuses = [...sorted.slice(0, index), created, ...sorted.slice(index)].map((s, i) => ({ ...s, orderindex: i }));
  return { statuses };
}

/** Where the new status goes, for the dry run: only a done status before the closed one is seen in the capture. */
function positionNote(current: FrontdoorStatus[], add: StatusAdd): string {
  const named = (flag: string | undefined) => current.find((s) => s.status.trim().toLowerCase() === flag?.trim().toLowerCase())?.status;
  if (add.after !== undefined) return `position: after "${named(add.after)}"`;
  if (add.before !== undefined) return `position: before "${named(add.before)}"`;
  if (!current.some((s) => s.type === "closed")) return "position: at the end (the set has no closed status; assumed)";
  return add.type === "done"
    ? "position: before the closed status (as in the capture)"
    : "position: before the closed status (assumed: the capture shows a done status there, not this type)";
}

function printSet(statuses: FrontdoorStatus[]): void {
  for (const s of statuses) {
    const mark = s.id ? "" : "   <- NEW";
    console.log(`${String(s.orderindex).padStart(2)} ${s.status.padEnd(16)} ${s.type.padEnd(7)} ${s.color}${mark}`);
  }
}

/**
 * After the PUT, compared with the plan: same count + 1; every previous status (by id) with the same name, type, color and
 * planned orderindex; exactly one new status, with the requested name, type, color and planned orderindex.
 */
function verify(planned: FrontdoorStatus[], previous: FrontdoorStatus[], after: FrontdoorStatus[], add: StatusAdd): string[] {
  const problems: string[] = [];
  if (after.length !== previous.length + 1) problems.push(`COUNT is ${after.length}, expected ${previous.length + 1}`);
  const previousIds = new Set(previous.map((p) => p.id));
  for (const p of planned.filter((s) => s.id)) {
    const now = after.find((s) => s.id === p.id);
    if (!now) problems.push(`LOST status "${p.status}" (${p.id})`);
    else if (now.status !== p.status || now.type !== p.type || now.color !== p.color || now.orderindex !== p.orderindex) {
      problems.push(
        `CHANGED status "${p.status}" (${p.id}): now "${now.status}" ${now.type} ${now.color} #${now.orderindex}, ` +
          `planned ${p.type} ${p.color} #${p.orderindex}`
      );
    }
  }
  const wanted = planned.find((s) => !s.id)!;
  const fresh = after.filter((s) => !previousIds.has(s.id));
  if (fresh.length !== 1) {
    problems.push(`expected exactly one new status "${add.name.trim()}", found ${fresh.length}${fresh.map((s) => ` "${s.status}"`).join("")}`);
  } else if (
    fresh[0].status !== wanted.status || fresh[0].type !== wanted.type ||
    fresh[0].color !== wanted.color || fresh[0].orderindex !== wanted.orderindex
  ) {
    problems.push(`the new status "${add.name.trim()}" is wrong: found "${fresh[0].status}" ${fresh[0].type} ${fresh[0].color} #${fresh[0].orderindex}`);
  }
  return problems;
}

export function createAddStatusCommand(frontdoorFactory: () => FrontdoorClient = createFrontdoorClient): CommandModule {
  return {
    command: "add-status",
    describe: "add a status to a space's status set (Frontdoor; space level only); a dry run unless --yes",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id" })
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "new status name" })
        .option("type", { type: "string", requiresArg: true, demandOption: true, choices: TYPES, describe: "status type" })
        .option("color", { type: "string", requiresArg: true, default: DEFAULT_COLOR, describe: "#rrggbb" })
        .option("after", { type: "string", requiresArg: true, conflicts: "before", describe: "put the new status right after this status" })
        .option("before", { type: "string", requiresArg: true, conflicts: "after", describe: "put the new status right before this status" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        if (argv.folder !== undefined || argv.list !== undefined) {
          throw new Error("--folder and --list wait for a capture of the web app call (Jack); only --space is built");
        }
        const space = argv.space as string | undefined;
        if (space === undefined || !/^\d+$/.test(space)) throw new Error("--space must be the numeric space id");
        const add: StatusAdd = { name: argv.name as string, type: argv.type as string, color: argv.color as string,
          after: argv.after as string | undefined, before: argv.before as string | undefined };
        const fd = frontdoorFactory();
        const previous = await fd.getSpaceStatuses(space);
        const body = planStatusAdd(previous, add);
        const path = `/hierarchy/v1/project/${space}/status?checkConflict=true`;
        if (!argv.yes) {
          printCall("PUT", path, undefined);
          printSet(body.statuses);
          console.log(positionNote(previous, add));
          console.log(JSON.stringify(body, null, 2));
          console.log("a real add replaces the whole status set: needs Jack's yes");
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
          console.error(`clickup add-status: ${(err as Error).message}${hint}`);
          process.exitCode = 1;
          return;
        }
        let problems: string[];
        let readBack: FrontdoorStatus[];
        try {
          readBack = await fd.getSpaceStatuses(space);
          problems = verify(body.statuses, previous, readBack, add);
        } catch (err) {
          console.error(
            `clickup add-status: the PUT WAS SENT, verification failed (${(err as Error).message}): ` +
              "re-read the set with GET and compare with the previous set above"
          );
          process.exitCode = 1;
          return;
        }
        if (problems.length > 0) {
          console.error(`clickup add-status: THE STATUS SET IS NOT AS PLANNED after the PUT:\n${problems.join("\n")}`);
          console.log("previous status set (for a manual restore):");
          console.log(previousJson);
          process.exitCode = 1;
          return;
        }
        console.log(`status added: ${add.name.trim()}`);
        console.log("the set as read back:");
        for (const s of [...readBack].sort((x, y) => x.orderindex - y.orderindex)) {
          console.log(`${String(s.orderindex).padStart(2)} ${s.status.padEnd(16)} ${s.type}`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup add-status: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const addStatusCommand: CommandModule = createAddStatusCommand();
