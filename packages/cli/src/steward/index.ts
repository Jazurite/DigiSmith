import type { CommandModule } from "yargs";
import { createClient } from "../clickup/lib.ts";
import { ALL_SPACE_IDS } from "../clickup/spaces.ts";
import { createDepotRegistry } from "../tokens/registry.ts";
import { ClickUpTracker } from "./clickup-tracker.ts";
import { claudeRunner } from "./model.ts";
import { fileIdea, type ModelRunner } from "./file.ts";
import { rebuild, runEvent, UsageError, type EventDeps, type EventResult } from "./event.ts";
import { readStewardProfile } from "./profile.ts";
import { stewardDir } from "./state.ts";
import { APPROVE_TARGETS, EVENTS, type ApproveTarget, type EventName } from "./types.ts";

/** The real dependencies: the profile picks the tracker; none or an unbuilt one means no tracker. */
export interface DepsOptions { quiet?: boolean; cwd?: string }

export function defaultDeps(opts: DepsOptions = {}): EventDeps {
  const profile = readStewardProfile(opts.cwd ?? process.cwd());
  let tracker = null;
  if (profile.tracker === "clickup") tracker = new ClickUpTracker(createClient(), ALL_SPACE_IDS);
  if (profile.tracker === "jira" && !opts.quiet) console.error("steward: the JIRA tracker is not built yet; nothing done");
  return {
    tracker,
    dir: stewardDir(),
    now: () => new Date(),
    config: { releaseStage: profile.releaseStage },
    sessionIds: (ticket) =>
      createDepotRegistry().read(ticket).filter((e) => e.kind === "session").map((e) => e.session_id),
  };
}

function guarded(depsFactory: (o?: DepsOptions) => EventDeps, body: (deps: EventDeps) => Promise<EventResult>, hook = false): Promise<void> {
  return (async () => {
    try {
      const res = await body(depsFactory({ quiet: hook }));
      for (const line of res.out) console.log(line);
      for (const line of res.warn) console.error(line);
      process.exitCode = 0;
    } catch (err) {
      if (err instanceof UsageError) {
        console.error(`steward: ${err.message}`);
        process.exitCode = hook ? 0 : 2;
      } else {
        console.error(`steward: ${(err as Error).message}`);
        process.exitCode = 0;
      }
    }
  })();
}

export function createStewardCommand(depsFactory: (o?: DepsOptions) => EventDeps = defaultDeps, runModel: ModelRunner = claudeRunner()): CommandModule {
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
              .option("quote", { type: "string", requiresArg: true, describe: "the approver's own words (Jack, or the Maestro for a Sign-off Auto ticket); required for approved, accepted, discard, close and completed" })
              .option("into", { type: "string", choices: [...APPROVE_TARGETS], describe: "approved only: the starter status (default to do)" })
              .option("dry-run", { type: "boolean", default: false, describe: "print the move, write nothing" })
              .option("hook", { type: "boolean", default: false, describe: "called from a skill or the factory: silent without a ClickUp tracker; a usage error in the handler exits 0 (yargs validation of flags still exits non-zero)" }),
          handler: (argv) =>
            guarded(depsFactory, async (deps) => {
              if (argv.into !== undefined && argv.event !== "approved") throw new UsageError("--into is valid only with approved");
              return runEvent(
                deps,
                argv.ticket as string,
                { event: argv.event as EventName, by: argv.by as string | undefined, sha: argv.sha as string | undefined, answer: argv.answer as "yes" | "no" | undefined, quote: argv.quote as string | undefined, into: argv.into as ApproveTarget | undefined },
                argv.dryRun as boolean,
              );
            }, argv.hook as boolean),
        })
        .command({
          command: "rebuild",
          describe: "rebuild a ticket's state file from ClickUp and the token registry",
          builder: (e) => e.option("ticket", { type: "string", requiresArg: true, demandOption: true }),
          handler: (argv) => guarded(depsFactory, (deps) => rebuild(deps, argv.ticket as string)),
        })
        .command({
          command: "file <idea>",
          describe: "file a new idea into the backlog: picks the list, the type and checks for a duplicate",
          builder: (e) =>
            e
              .positional("idea", { type: "string", demandOption: true })
              .option("type", { type: "string", choices: ["Task", "Bug", "Spike", "Epic", "Initiative"], describe: "force the type" }),
          handler: (argv) =>
            guarded(depsFactory, async (deps) => {
              if (!deps.tracker) return { out: [], warn: [] };
              return fileIdea({ tracker: deps.tracker, runModel, dir: deps.dir, now: deps.now }, argv.idea as string, { type: argv.type as string | undefined });
            }),
        })
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const stewardCommand = createStewardCommand();
export default stewardCommand;
