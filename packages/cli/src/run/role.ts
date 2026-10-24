// packages/cli/src/run/role.ts
// THE role rule (DGS-598). Every caller uses roleOf; DGS-599 imports it. No node imports (type imports and
// ticket-key.ts only), so the hook stays fast.
import { TICKET_KEY } from "../ticket-key.ts";
import type { Role, RoleFrom } from "./schema.ts";

export type RoleInput = { inHerdr: boolean; looked: boolean; agentName: string | null; maestroIdentity: boolean };

// A builder name is a lower-case ticket key, e.g. dgs-598 or b2b-1.
function isBuilderName(n: string): boolean {
  return n === n.toLowerCase() && TICKET_KEY.test(n.toUpperCase());
}

// looked: false in the hook (the herdr name is not read yet), true in the labeller.
export function roleOf(i: RoleInput): { role: Role; role_from: RoleFrom } {
  if (!i.inHerdr) return i.maestroIdentity ? { role: "maestro", role_from: "identity" } : { role: "other", role_from: "none" };
  if (!i.looked) return { role: "other", role_from: "pending" };
  const n = i.agentName;
  if (n === null) return { role: "other", role_from: "none" };
  if (n.endsWith("-conductor")) return { role: "conductor", role_from: "herdr" };
  if (n.includes("-rev")) return { role: "reviewer", role_from: "herdr" };
  if (n.includes("scout") || n.includes("probe")) return { role: "scout", role_from: "herdr" };
  if (isBuilderName(n)) return { role: "builder", role_from: "herdr" };
  return { role: "other", role_from: "herdr" };
}

export function ticketOfAgentName(name: string | null): string | null {
  return name !== null && isBuilderName(name) ? name.toUpperCase() : null;
}
