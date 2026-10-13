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
}

/**
 * The PUT replaces the WHOLE set, so the body is every current status untouched plus the new one (no id),
 * placed before the closed status; orderindex is re-numbered dense from 0. No status_change_map: nothing is removed.
 */
export function planStatusAdd(current: FrontdoorStatus[], add: StatusAdd): FrontdoorStatusSetBody {
  const name = add.name.trim();
  if (!name) throw new Error("--name must not be empty");
  if (!TYPES.includes(add.type)) throw new Error(`--type must be one of ${TYPES.join(", ")}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(add.color)) throw new Error("--color must look like #rrggbb");
  const clash = current.find((s) => s.status.toLowerCase() === name.toLowerCase());
  if (clash) throw new Error(`status "${clash.status}" already exists in this set`);
  if ((add.type === "open" || add.type === "closed") && current.some((s) => s.type === add.type)) {
    throw new Error(`the set already has a ${add.type} status; only one is kept (adding a second is not captured)`);
  }
  const at = current.findIndex((s) => s.type === "closed");
  const index = at === -1 ? current.length : at;
  const created: FrontdoorStatus = { status: name, type: add.type, orderindex: 0, color: add.color };
  const statuses = [...current.slice(0, index), created, ...current.slice(index)]
    .map((s, i) => ({ ...s, orderindex: i }));
  return { statuses };
}

function printSet(statuses: FrontdoorStatus[]): void {
  for (const s of statuses) {
    const mark = s.id ? "" : "   <- NEW";
    console.log(`${String(s.orderindex).padStart(2)} ${s.status.padEnd(16)} ${s.type.padEnd(7)} ${s.color}${mark}`);
  }
}

/** After the PUT: every previous status must still be there with the same name and type, and the new one must exist. */
function verify(previous: FrontdoorStatus[], after: FrontdoorStatus[], add: StatusAdd): string[] {
  const problems: string[] = [];
  for (const p of previous) {
    const now = after.find((s) => s.id === p.id);
    if (!now) problems.push(`LOST status "${p.status}" (${p.id})`);
    else if (now.status !== p.status || now.type !== p.type) {
      problems.push(`CHANGED status "${p.status}" (${p.id}): now "${now.status}" type ${now.type}, was type ${p.type}`);
    }
  }
  const added = after.find((s) => s.status.toLowerCase() === add.name.trim().toLowerCase() && s.type === add.type);
  if (!added) problems.push(`the new status "${add.name}" is not in the set`);
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
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        if (argv.folder !== undefined || argv.list !== undefined) {
          throw new Error("--folder and --list wait for a capture of the web app call (Jack); only --space is built");
        }
        const space = argv.space as string;
        const add: StatusAdd = { name: argv.name as string, type: argv.type as string, color: argv.color as string };
        const fd = frontdoorFactory();
        const previous = await fd.getSpaceStatuses(space);
        const body = planStatusAdd(previous, add);
        const path = `/hierarchy/v1/project/${space}/status?checkConflict=true`;
        if (!argv.yes) {
          printCall("PUT", path, undefined);
          printSet(body.statuses);
          console.log(JSON.stringify(body, null, 2));
          console.log("a real add replaces the whole status set: needs Jack's yes");
          console.log("nothing sent; add --yes to send");
          process.exitCode = 0;
          return;
        }
        // The PUT replaces the whole set: keep the full previous set in the output, so a manual restore is possible.
        console.log("previous status set (restore from this if needed):");
        console.log(JSON.stringify(previous, null, 2));
        await fd.putSpaceStatuses(space, body);
        const problems = verify(previous, await fd.getSpaceStatuses(space), add);
        if (problems.length > 0) {
          console.error(`clickup add-status: THE STATUS SET IS NOT AS PLANNED after the PUT:\n${problems.join("\n")}`);
          process.exitCode = 1;
          return;
        }
        console.log(`status added: ${add.name.trim()}`);
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup add-status: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const addStatusCommand: CommandModule = createAddStatusCommand();
