import type { Argv, CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTask, DependencyRelation } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { REF, KEY } from "./refs.ts";
import { printCall } from "./task-type-write.ts";


export type RelationKind = "dependency" | "link";
export type RelationAction = "add" | "remove";

export interface RelationSpec {
  kind: RelationKind;
  action: RelationAction;
}

/** One relation between two tasks, as the API sees it: `task` is the path task. */
export interface RelationRequest {
  task: string;
  other: string;
  /** Dependencies only: the other task is what `task` waits on ("waiting-on") or what waits on `task` ("blocking"). */
  side?: "waiting-on" | "blocking";
}

export interface RelationArgv {
  task?: string;
  waitingOn?: string;
  blocking?: string;
  to?: string;
  yes?: boolean;
}

/** Checks the flags without any network call. Throws on a bad ref, a missing or repeated flag, or a task related to itself. */
export function parseRelationArgv(spec: RelationSpec, argv: RelationArgv): RelationRequest {
  const task = argv.task === undefined ? "" : String(argv.task).trim();
  if (!REF.test(task)) throw new Error(`--task must be a task id or a key like DGS-12, got "${task}"`);
  let other: string | undefined;
  let side: RelationRequest["side"];
  if (spec.kind === "link") {
    if (argv.waitingOn !== undefined || argv.blocking !== undefined) throw new Error("a link has no --waiting-on or --blocking; use --to");
    if (argv.to === undefined) throw new Error("give --to <task id or key>");
    other = String(argv.to).trim();
  } else {
    if (argv.to !== undefined) throw new Error("a dependency has no --to; use --waiting-on or --blocking");
    if ((argv.waitingOn === undefined) === (argv.blocking === undefined)) {
      throw new Error("give exactly one of --waiting-on <task> or --blocking <task>");
    }
    side = argv.waitingOn !== undefined ? "waiting-on" : "blocking";
    other = String(argv.waitingOn ?? argv.blocking).trim();
  }
  if (!REF.test(other)) throw new Error(`the other task must be a task id or a key like DGS-12, got "${other}"`);
  if (other.toLowerCase() === task.toLowerCase()) throw new Error("a task cannot be related to itself");
  return { task, other, side };
}

function relationOf(side: "waiting-on" | "blocking", other: string): DependencyRelation {
  return side === "waiting-on" ? { dependsOn: other } : { dependencyOf: other };
}

/** The call as it will be sent, with the final task ids. */
export function describeCall(spec: RelationSpec, req: RelationRequest): { method: string; path: string; body?: unknown } {
  const method = spec.action === "add" ? "POST" : "DELETE";
  if (spec.kind === "link") return { method, path: `/task/${req.task}/link/${req.other}` };
  const field = req.side === "waiting-on" ? "depends_on" : "dependency_of";
  if (spec.action === "add") return { method, path: `/task/${req.task}/dependency`, body: { [field]: req.other } };
  return { method, path: `/task/${req.task}/dependency?${field}=${req.other}` };
}

/** Does `task` (read from ClickUp) already carry this relation? */
export function hasRelation(spec: RelationSpec, task: ClickUpTask, req: RelationRequest): boolean {
  if (spec.kind === "link") {
    const linked = task.linked_tasks as { task_id?: string; link_id?: string }[];
    return linked.some((l) => l.task_id === req.other || l.link_id === req.other);
  }
  // A dependency row says task_id waits on depends_on.
  const waiter = req.side === "waiting-on" ? req.task : req.other;
  const blocker = req.side === "waiting-on" ? req.other : req.task;
  const deps = task.dependencies as { task_id?: string; depends_on?: string }[];
  return deps.some((d) => d.task_id === waiter && d.depends_on === blocker);
}

function sentence(spec: RelationSpec, a: string, b: string, side?: RelationRequest["side"]): string {
  if (spec.kind === "link") return `${a} linked to ${b}`;
  return side === "waiting-on" ? `${a} waiting on ${b}` : `${a} blocking ${b}`;
}

const label = (t: ClickUpTask) => `${t.custom_id ?? t.id} (${t.id}) "${t.name}"`;

export function createRelationCommand(
  spec: RelationSpec,
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  const name = `${spec.action}-${spec.kind}`;
  const verb = spec.action === "add" ? "add" : "remove";
  const options = (y: Argv) => {
    let out = y.option("task", { type: "string", requiresArg: true, demandOption: true, describe: "task id or key (DGS-12)" });
    out =
      spec.kind === "link"
        ? out.option("to", { type: "string", requiresArg: true, describe: "the task to link to (id or key)" })
        : out
            .option("waiting-on", { type: "string", requiresArg: true, describe: "the task --task waits on (id or key)" })
            .option("blocking", { type: "string", requiresArg: true, describe: "the task that waits on --task (id or key)" });
    return out.option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" });
  };
  return {
    command: name,
    describe: `${verb} a task ${spec.kind} (public API); a dry run unless --yes${spec.action === "remove" ? "; removes the relation only, never a task" : ""}`,
    builder: options as unknown as CommandModule["builder"],
    handler: async (argv) => {
      try {
        const req = parseRelationArgv(spec, argv as unknown as RelationArgv);
        const needsLookup = argv.yes || KEY.test(req.task) || KEY.test(req.other);
        if (!needsLookup) {
          // Plain ids and no --yes: a dry run with no network and no credentials.
          const call = describeCall(spec, req);
          printCall(call.method, call.path, call.body);
          console.log("nothing sent; add --yes to send");
          process.exitCode = 0;
          return;
        }
        const client = clientFactory();
        const [a, b] = [await client.getTaskByRef(req.task), await client.getTaskByRef(req.other)];
        if (a.id === b.id) throw new Error(`a task cannot be related to itself: ${req.task} and ${req.other} are the same task (${a.id})`);
        const resolved: RelationRequest = { ...req, task: a.id, other: b.id };
        const present = hasRelation(spec, a, resolved);
        const text = sentence(spec, label(a), label(b), req.side);
        const call = describeCall(spec, resolved);
        if (!argv.yes) {
          printCall(call.method, call.path, call.body);
          console.log("read 2 tasks (read-only calls) to resolve and check; no write made");
          console.log(`${text}; currently ${present ? "set" : "not set"}`);
          console.log("nothing sent; add --yes to send");
        } else if (spec.action === "add" && present) {
          console.log(`already set: ${text}; nothing sent`);
        } else if (spec.action === "remove" && !present) {
          throw new Error(`not set: ${text}; nothing to remove`);
        } else {
          if (spec.kind === "link") {
            await (spec.action === "add" ? client.addLink(a.id, b.id) : client.removeLink(a.id, b.id));
          } else {
            const rel = relationOf(req.side as "waiting-on" | "blocking", b.id);
            await (spec.action === "add" ? client.addDependency(a.id, rel) : client.removeDependency(a.id, rel));
          }
          const after = await client.getTaskByRef(a.id);
          const now = hasRelation(spec, after, resolved);
          if (now !== (spec.action === "add")) {
            throw new Error(`sent, but read-back of ${a.id} does not show the change; check it with dg clickup get-task`);
          }
          console.log(`${spec.action === "add" ? "added" : "removed"}: ${text}; read back OK`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup ${name}: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}
