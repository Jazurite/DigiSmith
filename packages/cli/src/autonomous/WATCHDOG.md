# The Nightwatch watchdog (DGS-583)

The watchdog looks at every open run and says what state it is in. It writes a list of items that need Jack. It uses no model tokens. It never sends keys to a pane. It only runs `pane list`.

Command: `dg autonomous watch`. The Nexus scheduler runs it every 5 minutes, all day (job `nightwatch-watchdog`). Runs older than 7 days with no `ended` event are skipped.

## The five states

- `healthy`: the run moves and is inside its time budget.
- `blocked`: the last `blocked` event has no later `tool` or `turn_end` event. A prompt waits for an answer.
- `stalled`: the run is alive but has been in one phase longer than its budget.
- `lost`: the pane is gone, or the run has been silent for 30 minutes.
- `ended`: the run has an `ended` event.

## The check order

`classify` stops at the first rule that matches:

1. An `ended` event: `ended`.
2. The pane is gone: `lost`.
3. A `blocked` event with nothing after it: `blocked`. This beats silence.
4. No event for 30 minutes: `lost`.
5. The phase is over its budget: `stalled`.
6. Otherwise: `healthy`.

An unknown pane (herdr did not answer) never makes a run lost by itself.

## Files in the depot

All files are in the autonomous directory (`~/.digismith-depot/autonomous`, or `AUTONOMOUS_DIR`).

- `attention.jsonl`: one line opens an item, a later line with `resolved: true` closes it. The file is only appended to. There is one open item per run and kind. Items carry `causeClass` and `retryEligible`. Only `lost` items are retry eligible, and nothing retries in DGS-583 (DGS-588 does that).
- `notify-state.json`: which items already got a ClickUp comment, and when each ticket and kind last got one. Limits: one comment per ticket and kind per hour, 10 per pass. A failed comment stays pending and is tried again.
- `breaker.json`: the circuit breaker. Two failed releases in a row open it. A merged release resets the streak. A damaged file reads as open.

Item run keys: a failed release uses the ticket key. The breaker uses `breaker` (kind `failed` for an open breaker, kind `unknown` for an unreadable file).

## The budgets config block

In `.digismith/config.yml`:

    nightwatch:
      budgets:
        building: 45   # minutes
        review: 60
        merge: 20

These are the defaults. A value must be a positive whole number. A bad value keeps the default and opens a `bad-budget-config` item.

## The three commands

- `dg autonomous watch [--dry-run]`: one pass. `--dry-run` writes nothing.
- `dg autonomous attention [--json]`: list the open items. `dg autonomous attention resolve <id> [--note ...]` closes one.
- `dg autonomous resume`: close the breaker (`dg autonomous back` also does it).

The watchdog closes `blocked` and `stalled` items itself when the run moves on. It never closes a `lost` item. Only Jack does that.
