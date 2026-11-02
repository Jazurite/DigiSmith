import { currentCount } from "../../run/limit-check.ts";
import { refusal } from "../../run/limit.ts";
import type { Exec } from "../conductor.ts";
import { realExecOut, type ExecOut } from "../observers-real.ts";
import type { ScanDeps } from "../scan.ts";
import { readWorld, roleOfRun } from "./command.ts";
import { planLoop } from "./plan.ts";
import { directorTarget, projectConductorName, promptDirector, promptDriver } from "./target.ts";
import { wakeDirector } from "./wake.ts";

export interface WiringInput {
  dir: string; now: () => Date; conductorsJson: string; exec: Exec; execOut?: ExecOut; mainRepo: string; limitEnv: NodeJS.ProcessEnv;
}
export interface DirectorWiring {
  refine: NonNullable<ScanDeps["refine"]>;
  wake: () => Promise<void>;
  driver: NonNullable<ScanDeps["driver"]>;
  /** the tick's prompt for a ticket: to the ticket's driver; a failure is a PromptError that says whether anything was delivered */
  tickPrompt: (ticket: string) => (text: string) => Promise<void>;
}

/**
 * Production wiring of the Director: present only when the registry has an open factory entry named `director`.
 * Without one the lane, the wake and the driver hand-off stay off and the scan behaves as before.
 */
export function directorWiring(d: WiringInput): DirectorWiring | null {
  const t = directorTarget(d.conductorsJson);
  if (t === null) return null;
  const toDriver = (ticket: string, text: string): Promise<void> => promptDriver(d.exec, d.conductorsJson, d.dir, ticket, text);
  return {
    refine: {
      prompt: (m) => promptDirector(d.exec, d.conductorsJson, m),
      roleFull: () => refusal(currentCount(d.limitEnv, d.mainRepo, d.now().getTime()).count, "role"),
    },
    wake: async () => {
      const plan = planLoop(readWorld({ dir: d.dir, now: d.now, roleOf: roleOfRun }));
      await wakeDirector({ dir: d.dir, now: d.now, exec: d.execOut ?? realExecOut, target: () => ({ agent: t.name, session: t.session, workspace: t.workspace, scope: t.scope }) }, plan);
    },
    driver: { name: projectConductorName(d.conductorsJson), prompt: toDriver },
    // promptDriver throws a PromptError that already says whether anything was delivered
    tickPrompt: (ticket) => (text) => toDriver(ticket, text),
  };
}
