import { execFileSync } from "node:child_process";
import type { CommandModule } from "yargs";
import { closeTicketConductor, handover } from "./close.ts";
import { sweepTickets } from "./sweep.ts";
import { CASTLE, herdrWsPath, realExecOut, startTicketConductor, type ExecOut } from "./start-ticket.ts";

export interface ConductorDeps {
  exec: ExecOut;
  env: NodeJS.ProcessEnv;
  repo: string;
  /** Names of the live agents in a herdr session. */
  live: (session: string) => string[];
}

/** The agent names of one herdr session, through herdr-ws (read-only verb). */
export function realLive(session: string, run: (file: string, args: string[]) => string = (f, a) => execFileSync(f, a, { encoding: "utf8", timeout: 3000 })): string[] {
  const out = run(herdrWsPath(), ["--session", session, "agent", "list"]);
  const agents = (JSON.parse(out) as { result?: { agents?: { name?: unknown }[] } }).result?.agents;
  // an answer without the list must not read as "nothing runs": sweep would call every ticket conductor gone
  if (!Array.isArray(agents)) throw new Error("agent list: no result.agents array");
  return agents.flatMap((a) => (typeof a.name === "string" ? [a.name] : []));
}

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

/** `dg conductor ...` (spec 6.2, 6.3). Deps are injectable for tests. */
export function makeConductorCommand(over: Partial<ConductorDeps> = {}): CommandModule {
  const deps = (): ConductorDeps => ({
    exec: over.exec ?? realExecOut,
    env: over.env ?? process.env,
    repo: over.repo ?? process.cwd(),
    live: over.live ?? realLive,
  });
  const project = (env: NodeJS.ProcessEnv, given: unknown): string => (typeof given === "string" && given !== "" ? given : (env.DIGISMITH_PROJECT ?? "DigiSmith"));

  const start: CommandModule = {
    command: "start-ticket",
    describe: "start a ticket conductor tab in Castle for one ticket",
    builder: (y) =>
      y
        .option("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-9" })
        .option("under", { type: "string", demandOption: true, describe: "name of the conductor that starts it" })
        .option("project", { type: "string", describe: "project (default DIGISMITH_PROJECT or DigiSmith)" }),
    handler: async (a) => {
      try {
        const d = deps();
        const r = await startTicketConductor({ ticket: a.ticket as string, under: a.under as string, project: project(d.env, a.project) }, { exec: d.exec, env: d.env, repo: d.repo });
        console.log(`${r.key} ${r.pane}`);
      } catch (e) {
        fail((e as Error).message);
      }
    },
  };

  const close: CommandModule = {
    command: "close",
    describe: "close this ticket conductor (run it inside its own tab)",
    builder: (y) => y.option("self", { type: "boolean", describe: "required: close the conductor named by DIGISMITH_NAME" }).option("project", { type: "string" }),
    handler: async (a) => {
      try {
        const d = deps();
        if (a.self !== true) return fail("dg conductor close needs --self");
        const name = d.env.DIGISMITH_NAME;
        if (name === undefined || name === "") return fail("DIGISMITH_NAME is not set: close --self runs inside the conductor's own tab");
        await closeTicketConductor({ name, project: project(d.env, a.project) }, { exec: d.exec, env: d.env, repo: d.repo });
      } catch (e) {
        fail((e as Error).message);
      }
    },
  };

  const hand: CommandModule = {
    command: "handover",
    describe: "change the driver of a ticket, only from the named current driver",
    builder: (y) =>
      y
        .option("ticket", { type: "string", demandOption: true })
        .option("from", { type: "string", demandOption: true })
        .option("to", { type: "string", demandOption: true }),
    handler: (a) => {
      try {
        const r = handover({ ticket: a.ticket as string, from: a.from as string, to: a.to as string }, deps().env);
        console.log(`${r.ticket} ${r.driver}`);
      } catch (e) {
        fail((e as Error).message);
      }
    },
  };

  const sweep: CommandModule = {
    command: "sweep",
    describe: `list the ticket conductors of the registry and whether they still run in ${CASTLE}`,
    builder: (y) => y,
    handler: () => {
      try {
        const d = deps();
        for (const r of sweepTickets(d.env, d.live)) console.log(`${r.key} ${r.ticket ?? "-"} ${r.verdict}`);
      } catch (e) {
        fail((e as Error).message);
      }
    },
  };

  return {
    command: "conductor",
    describe: "ticket conductors: start-ticket, close, handover, sweep",
    builder: (y) => y.command(start).command(close).command(hand).command(sweep).demandCommand(1, ""),
    handler: () => {},
  };
}

const conductorCommand = makeConductorCommand();
export default conductorCommand;
