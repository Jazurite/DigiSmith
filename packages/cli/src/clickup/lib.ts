import { ClickUpClient, checkCredentials } from "@digismith/clickup-client";

export function createClient(envPath?: string): ClickUpClient {
  const creds = checkCredentials(envPath);
  return new ClickUpClient({
    CLICKUP_TEAM_ID: creds.teamId,
    CLICKUP_API_TOKEN: creds.apiToken,
  });
}
