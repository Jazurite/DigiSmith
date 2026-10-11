import { ClickUpClient, FrontdoorClient, checkCredentials, readFrontdoorAuth, Space } from "@digismith/clickup-client";
import { readFileSync } from "node:fs";
import { parseDateFlag, assertDateOrder } from "./parse-date.ts";
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";
import type { Argv } from "yargs";

export function createClient(envPath?: string): ClickUpClient {
  const creds = checkCredentials(envPath);
  return new ClickUpClient({
    CLICKUP_TEAM_ID: creds.teamId,
    CLICKUP_API_TOKEN: creds.apiToken,
  });
}

export function createFrontdoorClient(envPath?: string): FrontdoorClient {
  const creds = checkCredentials(envPath);
  const auth = readFrontdoorAuth(envPath);
  if (!auth) {
    throw new Error(
      "CLICKUP_FRONTDOOR_AUTH is missing in ~/.digismith-depot/.env; run dg clickup frontdoor import-auth"
    );
  }
  return new FrontdoorClient({ CLICKUP_TEAM_ID: creds.teamId, CLICKUP_FRONTDOOR_AUTH: auth });
}

export const DIGISMITH_SPACE_ID = "1301150000001271";

export function createDigiSmithSpace(client: ClickUpClient = createClient()): Space {
  return new Space(client, DIGISMITH_SPACE_ID);
}

/**
 * The task flags `buildTaskWriteBody` reads. `withTaskFieldOptions` also declares `type` and `field`,
 * but those are not here: the commands handle them themselves.
 */
export interface TaskFieldArgv {
  name?: string;
  description?: string;
  markdownDescription?: string;
  markdownDescriptionFile?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  priority?: number;
  parent?: string;
}

/** The yargs options create-task and update-task share; `--parent` wording differs per command. */
export function withTaskFieldOptions(y: Argv, opts: { parentDescribe: string }): Argv {
  return y
    .option("description", { type: "string", requiresArg: true, describe: "task description" })
    .option("markdown-description", {
      type: "string",
      requiresArg: true,
      describe: "task description as Markdown (ClickUp renders it); not with the other description flags",
    })
    .option("markdown-description-file", {
      type: "string",
      requiresArg: true,
      describe: "read the Markdown description from this UTF-8 file; not with the other description flags",
    })
    .option("status", { type: "string", requiresArg: true, describe: "status (must exist on the list)" })
    .option("start-date", { type: "string", requiresArg: true, describe: "start date, e.g. 2026-08-28" })
    .option("due-date", { type: "string", requiresArg: true, describe: "due date, e.g. 2026-08-28" })
    .option("priority", {
      type: "number",
      requiresArg: true,
      describe: "1=urgent, 2=high, 3=normal, 4=low",
    })
    .option("parent", { type: "string", requiresArg: true, describe: opts.parentDescribe })
    .option("type", {
      type: "string",
      requiresArg: true,
      describe: "task type, by name (singular or plural) or id; 0 = plain task",
    })
    .option("field", {
      type: "string",
      array: true,
      requiresArg: true,
      describe: 'set a custom field: "<field name or id>=<value>" (split at the first =); repeat for more. Relationship fields take task keys or ids, comma-separated; a - prefix removes',
    });
}

export function buildTaskWriteBody(argv: TaskFieldArgv): ClickUpTaskWriteBody {
  const body: ClickUpTaskWriteBody = {};
  if (argv.name !== undefined) body.name = argv.name;
  const descriptionFlags = [argv.description, argv.markdownDescription, argv.markdownDescriptionFile];
  if (descriptionFlags.filter((v) => v !== undefined).length > 1) {
    throw new Error("use only one of --description, --markdown-description, --markdown-description-file");
  }
  if (argv.description !== undefined) body.description = argv.description;
  if (argv.markdownDescription !== undefined) {
    if (typeof argv.markdownDescription !== "string") throw new Error("pass --markdown-description once");
    if (argv.markdownDescription.trim() === "") throw new Error("--markdown-description needs non-empty text");
    body.markdown_description = argv.markdownDescription;
  }
  if (argv.markdownDescriptionFile !== undefined) {
    const file = argv.markdownDescriptionFile;
    if (typeof file !== "string") throw new Error("pass --markdown-description-file once");
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      throw new Error(`cannot read --markdown-description-file ${file}: ${(err as Error).message}`);
    }
    if (text.startsWith("\uFEFF")) text = text.slice(1);
    if (text.trim() === "") throw new Error(`--markdown-description-file ${file} is empty`);
    body.markdown_description = text;
  }
  if (argv.status !== undefined) body.status = argv.status;
  if (argv.startDate !== undefined) {
    const { ms, hasTime } = parseDateFlag(argv.startDate, "--start-date");
    body.start_date = ms;
    body.start_date_time = hasTime;
  }
  if (argv.dueDate !== undefined) {
    const { ms, hasTime } = parseDateFlag(argv.dueDate, "--due-date");
    body.due_date = ms;
    body.due_date_time = hasTime;
  }
  assertDateOrder(body.start_date, body.due_date);
  if (argv.priority !== undefined) {
    if (!Number.isInteger(argv.priority)) {
      throw new Error(`invalid --priority "${argv.priority}" — expected an integer 1-4`);
    }
    body.priority = argv.priority;
  }
  if (argv.parent !== undefined) body.parent = argv.parent === "" ? "none" : argv.parent;
  return body;
}
