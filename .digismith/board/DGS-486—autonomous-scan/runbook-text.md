## Autonomous order

Add this section to the conductor runbook. The runbook is untracked, so the Maestro applies the text.

1. **How to know it.** An order file named `order-ao-<stamp>-<KEY>.md` in the orders folder, plus a prompt line `Autonomous order: build <KEY>, read <path>`, means an Autonomous Operation build (night or away). Read the order first. It names the ticket, the Sign-off value and the spec and plan.

2. **Build it with the normal flow.** Follow the seat rule. Use a Builder in role mode and Reviewers. Merge, then run the post-finish hooks 01-03. Write report.html and commit plan.md with it. Times in UTC+7 first.

3. **Mandate.** The order carries it word for word. Keep to it:

   Allowed: merge, push, restart an already-installed service. Never: `sudo`, a new background service or LaunchAgent, any delete, a Caddy or Tailscale change. When the ticket needs one of these, stop that ticket: call `dg autonomous release --ticket <KEY> --result stopped --reason "<what is needed>"`. The ticket then waits for Jack. Leave a comment on the ticket; release clears the lock, so never remove lock.json by hand.

4. **Closing command.** Run this as the last step, even when the build fails:

   `dg autonomous release --ticket <KEY> --result <merged|failed|stopped|awaiting-jack> [--reason "..."]`

   Use `merged` after the merge and push. Use `failed` when the build fails. Use `stopped` when the mandate stops the ticket. Use `awaiting-jack` for a Sign-off: Jack ticket. Release clears the lock and asks the scan to run again at once.

5. **Sign-off: Jack.** A ticket with `Sign-off: Jack` runs to the acceptance point and stops there. Call `dg autonomous release --ticket <KEY> --result awaiting-jack`. Release clears the lock, so never remove lock.json by hand. Jack accepts when he is back. Do not mark the ticket done.

6. **Never clear state by hand.** Nobody clears `lock.json` or `away.json` by hand. `release` clears the lock. `dg autonomous back` turns the away switch off.

7. **Look at the state.** `dg autonomous status` shows the away switch, the lock and the last scan.
