# The conductor's state block

Each conductor keeps one block in its note, between `<!-- digismith:conductor-state v1 -->` and `<!-- /digismith:conductor-state -->`. The catch-up and `consult` read it. A block that nobody refreshes shows a wrong picture, so the conductor refreshes it with a script and not from memory (DGS-462).

## The routine (digismith-conductor and d3-conductor)

```
node --experimental-strip-types scripts/conductor/cli.ts state-refresh --conductor <own name> --workers <w1,w2,...>
```

`HERDR_WS` pins the herdr workspace (or pass `--herdr-workspace`). Run it:

- after every merge (right after hook 03),
- after every worker start and every worker stop,
- after you edit Waiting, Decided, Parked or Next,
- before any catch-up (the catch-up also runs it first by itself).

`--workers` is the list of worker pane names this conductor owns now. The next refresh without `--workers` reuses the stored list. A card whose `under` is this conductor also counts. Without `HERDR_WS` the workspace comes from the conductor card's `runs_on` (`herdr w2:p1`); with neither, Running is kept as it was. A pane in neither is shown under Health as `owner unknown`, never as Running.

## What the refresh does

- **Running** is rebuilt from `herdr agent list` (read only) and the open worker cards. Never kept from the old block.
- **Waiting for Jack, Parked or failed, Next** keep every item, unless its marker says it is resolved.
- **Decided under the mandate** and the seats are kept as they are.
- It sets `Updated:` and `Main:` (the newest merge it saw) and writes only the block. It refuses to write when the block changed while it ran, when the block is not valid, or when the note does not exist (`--create` allows a new note).
- Path and ticket markers need a checkout with a `.digismith` folder; in a plugin cache copy they are not evaluated.

## Resolved items: `[resolves: ...]` markers

An item drops out only if you put a marker in its first field. No marker: it stays until you edit it. The markers (all must hold when an item has several):

| Marker | Resolved when |
|---|---|
| `[resolves: ticket DGS-411]` | ClickUp status is done or closed |
| `[resolves: merged DGS-411]` | a commit on origin/main names the key |
| `[resolves: gone <path>]` | the path (relative to the repo root) no longer exists |
| `[resolves: exists <path>]` | the path exists |

Example:

```
## Waiting for Jack
- Delete the stray file .tmp-probe [resolves: gone .tmp-probe] | since 2026-10-13T20:00+07:00 | pane w2:p1

## Next
1. Jack: first use of DGS-411 [resolves: ticket DGS-411]
```

A bad marker, an unreadable ticket, a failed git read or a path outside the repo keeps the item and prints a warning. The catch-up shows the text without the marker.

## Age and the warning

`state` and the catch-up show `state block updated <time>, <age> old`. When the block is older than the newest merge on origin/main (a plugin version bump does not count; the block's `Main:` hash is compared when it has one, else the commit time), they warn `older than the newest merge ... run state-refresh`.
