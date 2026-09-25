import { ClickUpClient, checkCredentials } from "@digismith/clickup-client";
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";

export function createClient(envPath?: string): ClickUpClient {
  const creds = checkCredentials(envPath);
  return new ClickUpClient({
    CLICKUP_TEAM_ID: creds.teamId,
    CLICKUP_API_TOKEN: creds.apiToken,
  });
}

export interface TaskFieldArgv {
  name?: string;
  description?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  priority?: number;
}

export function buildTaskWriteBody(argv: TaskFieldArgv): ClickUpTaskWriteBody {
  const body: ClickUpTaskWriteBody = {};
  if (argv.name !== undefined) body.name = argv.name;
  if (argv.description !== undefined) body.description = argv.description;
  if (argv.status !== undefined) body.status = argv.status;
  if (argv.startDate !== undefined) {
    const startDate = new Date(argv.startDate).getTime();
    if (Number.isNaN(startDate)) {
      throw new Error(`invalid --start-date "${argv.startDate}" — expected an ISO date like 2026-08-28`);
    }
    body.start_date = startDate;
  }
  if (argv.dueDate !== undefined) {
    const dueDate = new Date(argv.dueDate).getTime();
    if (Number.isNaN(dueDate)) {
      throw new Error(`invalid --due-date "${argv.dueDate}" — expected an ISO date like 2026-08-28`);
    }
    body.due_date = dueDate;
  }
  if (argv.priority !== undefined) {
    if (!Number.isInteger(argv.priority)) {
      throw new Error(`invalid --priority "${argv.priority}" — expected an integer 1-4`);
    }
    body.priority = argv.priority;
  }
  return body;
}
