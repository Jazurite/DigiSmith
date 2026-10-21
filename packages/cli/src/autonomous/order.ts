import { join } from "node:path";

export function orderPath(ordersDir: string, stamp: string, key: string): string {
  return join(ordersDir, `order-ao-${stamp}-${key}.md`);
}

export interface OrderInput {
  key: string;
  name: string;
  taskId: string;
  signOff: "Auto" | "Jack";
  claimedAtUtc7: string;
  stamp: string;
  specPlan: string;
}

export function renderOrder(i: OrderInput): string {
  const lines = [
    `# Order ao-${i.stamp}: build ${i.key} (Autonomous Operation)`,
    "",
    `From: dg autonomous scan, ${i.claimedAtUtc7} UTC+7`,
    "",
    `Ticket: ${i.key} ${i.name} (task id ${i.taskId})`,
    `Sign-off: ${i.signOff}`,
    "",
    "Spec and plan:",
    i.specPlan,
    "",
    "## Steps",
    "1. Build the ticket per the conductor runbook: seat rule, Builder in role mode, Reviewers.",
    "2. Merge, then run the post-finish hooks 01-03.",
    "3. Write report.html and commit plan.md with it.",
    "",
    "## Mandate (works at night and while away)",
    `Allowed: merge, push, restart an already-installed service. Never: \`sudo\`, a new background service or LaunchAgent, any delete, a Caddy or Tailscale change. When the ticket needs one of these, stop that ticket: call \`dg autonomous release --ticket ${i.key} --result stopped --reason "<what is needed>"\`. The ticket then waits for Jack. Leave a comment on the ticket; release clears the lock, so never remove lock.json by hand.`,
    "",
  ];
  if (i.signOff === "Jack") {
    lines.push(
      "## Sign-off: Jack",
      `This ticket has Sign-off: Jack. Run it to the acceptance point, then call \`dg autonomous release --ticket ${i.key} --result awaiting-jack\`. The release call clears the lock (release clears the lock), so never remove lock.json by hand. Jack accepts when he is back.`,
      "",
    );
  }
  lines.push(
    "## Last step",
    `dg autonomous release --ticket ${i.key} --result <merged|failed|stopped|awaiting-jack> [--reason "..."]`,
    "",
  );
  return lines.join("\n");
}
