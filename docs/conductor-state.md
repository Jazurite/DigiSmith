# The conductor's state block

Each conductor keeps one block in its note, between `<!-- digismith:conductor-state v1 -->` and `<!-- /digismith:conductor-state -->`. The catch-up and `consult` read it. A block that nobody refreshes shows a wrong picture, so the conductor refreshes it with a script and not from memory (DGS-462).

**The depot block is the only state the catch-up reads.** A project note (for example `Workspace/Emma/.../note.md`) is not read. A conductor with a project note passes it to `--watch`; the catch-up then warns when that file is newer than the block content (DGS-577).

## The routine (digismith-conductor and d3-conductor)

```
node --experimental-strip-types scripts/conductor/cli.ts state-refresh --conductor <own name> --workers <w1,w2,...> [--watch <project note>,<board folder>]
```

`HERDR_WS` pins the herdr workspace (or pass `--herdr-workspace`). Run it:

- after every merge (right after hook 03),
- after every worker start and every worker stop,
- after you edit Waiting, Decided, Parked or Next,
- before any catch-up (the catch-up also runs it first by itself).

`--watch` is a list of files or folders, as absolute paths (a relative path is looked up from the folder where the command runs, and the catch-up may run elsewhere; a folder is walked to depth 3, at most 2000 entries). The next refresh without `--watch` reuses the stored list. A conductor that keeps a project note outside the depot passes the note and the project's `.digismith/board` folder. A missing path gives a warning, not an error.

`--workers` is the list of worker pane names this conductor owns now. The next refresh without `--workers` reuses the stored list. A card whose `under` is this conductor also counts. Without `HERDR_WS` the workspace comes from the conductor card's `runs_on` (`herdr w2:p1`); with neither, Running is unknown (see below). A pane in neither is shown under Health as `owner unknown`, never as Running.

## What the refresh does

- **Running** is rebuilt from `herdr agent list` (read only) and the open worker cards. Never kept from the old block. When herdr cannot be read or no workspace is known (a card without `runs_on` counts, and the reason names the card), the block says `Running: unknown (<reason>)` in its header and has no Running rows.
- **Waiting for Jack, Parked or failed, Next** keep every item, unless its marker says it is resolved.
- **Decided under the mandate** and the seats are kept as they are.
- It sets `Updated:` (the refresh time), `Changed:` (the content time; kept when the refresh changes nothing) and `Main:` (the newest merge it saw) and writes only the block. It refuses to write when the block changed while it ran, when the block is not valid, or when the note does not exist (`--create` allows a new note).
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

## Age and the warnings

The block header has these time and watch lines:

- `Updated:` is when the block was last refreshed or written.
- `Changed:` is when the block content last changed. A refresh that changes nothing keeps it. `state-write` computes it: the same content as the block in the note keeps the old time, other content sets now. A `Changed:` in the pasted text is ignored. A block without it shows `content change time not recorded`; the next change writes it.
- `Watch:` lists the `--watch` paths.
- `Running: unknown (<reason>)` is written when Running could not be rebuilt. The catch-up shows one Running line `unknown | - | <reason>`.

The catch-up Health line shows `state block refreshed <time>, <age> ago; content changed <time>, <age> ago`, then `warnings: ...` (the first five, then `(+N more)`). It warns when:

- the content has not changed for more than 2 days (`STALE_AFTER_MS` in `scripts/conductor/state.ts`), and when a Running or Waiting item is older than 2 days;
- a `Watch:` path changed after `Changed:`: `<path> changed <time>, after the block content: the block may be behind`;
- the project is `DigiSmith`, the folder is a git checkout, and the block is older than the newest merge on origin/main (a plugin version bump does not count; the block's `Main:` hash is compared when it has one, else the commit time). Any other project, or a plugin cache copy, skips this check with no error.
