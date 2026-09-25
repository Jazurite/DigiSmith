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
  if (argv.startDate !== undefined) body.start_date = new Date(argv.startDate).getTime();
  if (argv.dueDate !== undefined) body.due_date = new Date(argv.dueDate).getTime();
  if (argv.priority !== undefined) body.priority = argv.priority;
  return body;
}
