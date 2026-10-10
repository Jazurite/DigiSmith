# A monitoring and analysis client: how much each account is used, per worker and per ticket

**ClickUp:** **DGS-315** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea, Jack (2026-10-03). No ClickUp ticket yet. Likely home: **C: Platform, C.3: Accounts**, in the Capacity
submodule (seats, usage and limit stops). Jack has not decided the lineage.

**Source:** Live session 2026-10-03, right after the maestro read both Claude seats with the usage probe. Jack: "we need
a new client to do monitoring and analysis, like telemetry and monitoring metrics". It would watch each account: how much
it is used, the stats, how many tokens. From the start of a piece of work to its finish, it would show the change, for
example 35% to 49% of the 5-hour window, and the weekly percentage as well.

## A worked example from the same day

Both seats were read by hand with the probe. The numbers are percent used.

| | 14:40 UTC+7 [07:40Z] | 15:35 UTC+7 [08:35Z] | Change |
|---|---|---|---|
| `jack`, 5h window | 35% | 49% | +14 points |
| `jack`, weekly | 37% | 39% | +2 points |
| `dev0`, 5h window | 68% | 85% | +17 points |
| `dev0`, weekly | 58% | 61% | +3 points |

In that window the two D.3 workers (DGS-76 and DGS-137) ran on `jack`, from 15:04 to about 15:33 UTC+7. The maestro ran on
`dev0`. A difference like this is an upper bound for one worker. It also holds any other use of the same seat, such as
other Desktop sessions and other devices. The client must show that noise, not hide it.

## What exists today

- **The usage probe.** Claude Code passes `rate_limits` to a status line command: `five_hour` and `seven_day`, each with
  `used_percentage` and `resets_at`. It works with a `claude setup-token` login. The probe is in
  `~/.digismith-depot/usage-probe/`, and the steps are in the Workbox runbook, "Reading usage". It gives percentages only,
  no tokens. One reading costs a short Haiku prompt on that seat.
- **Telemetry (`digismith:telemetry`).** It copies a ticket's session transcript into the repo for process analysis. It
  does not measure quota.
- **The K.4 token counter.** It prices a `TokenUsage`, but nothing produces a real one yet
  ([token-counter-usage-producer-gap.md](token-counter-usage-producer-gap.md)).
- **DGS-151 (`dg workbox`).** It already names the probe as the data source of its v2 account balancer
  ([dg-workbox-package.md](dg-workbox-package.md)).

## What the client would do (a sketch, not a design)

- **Record.** Take a reading of each account at fixed points: a worker starts, a worker finishes (the flux points in the
  runbook), a limit stop, and a slow poll. Each record holds the time, the account, the 5h and weekly percent used, and
  both reset times.
- **Attribute.** Pair a start reading and a finish reading to a worker, a ticket and a lineage. The result is the points
  of 5h and weekly quota that work used, with its duration and model.
- **Count tokens.** Input, output and cache tokens for each worker. A possible source is the per-message `usage` in the
  Claude Code session transcript, or the final `usage` object of `stream-json` (see the token-counter gap). Check which
  one works for a worker started with `herdr agent start`.
- **Analyse.** Use per account over time, cost per ticket, per lineage and per model, and a forecast of when a seat hits
  its limit. `dev0` at 85% of 5h is the case to catch early.
- **Feed the balancer.** Give the account rule real history for its headroom ranking, and warn at a set percent.
- **Report.** A command such as `dg workbox usage`, or a small page.

## Open questions

- **Where it lives.** A new package, with a name still open (for example `packages/usage-client`), like `clickup-client`
  and `jira-client`. Does `dg workbox` import it?
- **Storage.** An append-only file under `~/.digismith-depot/`, or somewhere else.
- **Who takes the readings.** Not the maestro: it only gives orders. A worker or a herdr pane takes them, triggered by the
  flux steps.
- **Cost of a reading.** One Haiku prompt per seat each time. Is there a cheaper source?
- **More seats.** A third account is planned. It must work for any number of accounts.
- **Overlap.** Telemetry, the K.4 token counter and this client all touch usage. One client or three?
- **Noise.** Use of a seat from another device cannot be seen. Mark a reading as noisy when other sessions are known to
  be running.

## Next

Jack decides the lineage and whether to file a ClickUp ticket. No code until then.
