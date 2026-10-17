import type { CommandModule } from "yargs";
import { createClient, DIGISMITH_SPACE_ID } from "../clickup/lib.ts";
import { createDepotRegistry } from "../tokens/registry.ts";
import { ClickUpTracker } from "./clickup-tracker.ts";
import { rebuild, runEvent, UsageError, type EventDeps } from "./event.ts";
import { readStewardProfile } from "./profile.ts";
import { stewardDir } from "./state.ts";
import { EVENTS, type EventName } from "./types.ts";

/** The real dependencies: the profile picks the tracker; none or an unbuilt one means no tracker. */
export function defaultDeps(): EventDeps {
  const profile = readStewardProfile(process.cwd());
  let tracker = null;
  if (profile.tracker === "clickup") tracker = new ClickUpTracker(createClient(), DIGISMITH_SPACE_ID);
  if (profile.tracker === "jira") console.error("steward: the JIRA tracker is not built yet; nothing done");
  return {
    tracker,
    dir: stewardDir(),
    now: () => new Date(),
    config: { releaseStage: profile.releaseStage },
    sessionIds: (ticket) =>
      createDepotRegistry().read(ticket).filter((e) => e.kind === "session").map((e) => e.session_id),
  };
}

function guarded(depsFactory: () => EventDeps, body: (deps: EventDeps) => Promise<string[]>): Promise<void> {
  return (async () => {
    try {
      for (const line of await body(depsFactory())) console.log(line);
      process.exitCode = 0;
    } catch (err) {
      if (err instanceof UsageError) {
        console.error(`steward: ${err.message}`);
        process.exitCode = 2;
      } else {
        console.error(`steward: ${(err as Error).message}`);
        process.exitCode = 0;
      }
    }
  })();
}

export function createStewardCommand(depsFactory: () => EventDeps = defaultDeps): CommandModule {
  return {
    command: "steward",
    describe: "keep ClickUp in step with the work: apply status events, file new ideas",
    builder: (y) =>
      y
        .command({
          command: "event <event>",
          describe: "apply one event to a ticket (the Steward moves the status along DGS-488's map)",
          builder: (e) =>
            e
              .positional("event", { type: "string", choices: [...EVENTS], demandOption: true })
              .option("ticket", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key, e.g. DGS-549" })
              .option("by", { type: "string", requiresArg: true, describe: "who sends it (kept in the log only)" })
              .option("sha", { type: "string", requiresArg: true, describe: "merge sha, for merged" })
              .option("answer", { type: "string", choices: ["yes", "no"], describe: "Jack's answer, for accepted" })
              .option("quote", { type: "string", requiresArg: true, describe: "Jack's own words; required for approved, accepted, discard and close" })
              .option("dry-run", { type: "boolean", default: false, describe: "print the move, write nothing" }),
          handler: (argv) =>
            guarded(depsFactory, (deps) =>
              runEvent(
                deps,
                argv.ticket as string,
                { event: argv.event as EventName, by: argv.by as string | undefined, sha: argv.sha as string | undefined, answer: argv.answer as "yes" | "no" | undefined, quote: argv.quote as string | undefined },
                argv.dryRun as boolean,
              )),
        })
        .command({
          command: "rebuild",
          describe: "rebuild a ticket's state file from ClickUp and the token registry",
          builder: (e) => e.option("ticket", { type: "string", requiresArg: true, demandOption: true }),
          handler: (argv) => guarded(depsFactory, (deps) => rebuild(deps, argv.ticket as string)),
        })
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const stewardCommand = createStewardCommand();
export default stewardCommand;
