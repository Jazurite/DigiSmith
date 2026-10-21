## Controller retry for a lost builder run (DGS-588)

Text for the Maestro to apply to the conductor runbook.

### Restart order from the controller

- The conductor may get one order from the controller: `<KEY>: restart the builder, its pane is gone`.
- The order means the watchdog marked the builder run lost, and the cause may be transient.
- The conductor restarts the builder as `dg run start` does today.
- The new run id must have a `started` event. If it has none, the controller raises `journal-uncertain-retry` after 15 minutes.
- There is never a second automatic order for the ticket.
- A second failure stays an attention item for Jack. The conductor does not restart the builder again on its own.

### First use

First use runs after merge and install, with the Nexus API restarted once. The Maestro does both.

1. Take a throwaway ticket with a live lock. Run a builder whose pane is closed.
2. The watchdog marks the run lost (retry eligible).
3. The next tick sends one restart order to the conductor.
4. `dg autonomous journal` shows the retry line.
5. The conductor restarts the builder. The new run starts. The item resolves.
6. Close the new pane again. The item opens and no second order is sent.
7. The conductor reports the three journal lines.
