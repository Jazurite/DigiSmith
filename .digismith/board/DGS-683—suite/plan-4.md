# DGS-683 ticket 4: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

## Ticket B: Suite boot files (proposals in the repo; install = conductor)

### Task 13 (T13): the Suite daemon files

**Files:**
- Create: `scripts/herdr/herdr-boot-suite.sh`, `scripts/herdr/com.jazurite.herdr-suite.plist`, `scripts/herdr/README.md`
- Test: `scripts/herdr/boot-files.test.ts`

**Content (exact):** `herdr-boot-suite.sh` is `herdr-boot.sh` with `--session Suite` and the comment "Starts ONLY the session Suite (conductors). The Floor is herdr-boot.sh." `com.jazurite.herdr-suite.plist` is `com.jazurite.herdr.plist` (read it from `/Library/LaunchDaemons/` for the exact keys) with `Label com.jazurite.herdr-suite`, `ProgramArguments /Users/workbox/.local/bin/herdr-boot-suite.sh`, log paths `/Users/workbox/.config/herdr/suite.launchd.out.log` and `suite.launchd.err.log`. `README.md` lists the manual install lines for the conductor/Jack: `cp`, `chmod +x`, `sudo cp` and `sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.herdr-suite.plist` (Jack types the sudo lines; an agent never runs them).

- [ ] **Step 1: Write the failing test:** the shell file passes `bash -n`, contains `--session Suite server` and not `--session default`; the plist is valid XML (`plutil -lint` when on macOS, else a regex check for balanced `<dict>`), has the new Label and log paths, `RunAtLoad`, `KeepAlive` with `SuccessfulExit false`, `UserName workbox`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/boot-files.test.ts`
- [ ] **Step 3: Create the files.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): add the Suite daemon files"`

### Task 14 (T14): the registry-driven bootstrap

**Files:**
- Create: `scripts/herdr/herdr-bootstrap.sh` (the new text of `~/.local/bin/herdr-bootstrap.sh`), `scripts/herdr/fake-herdr.sh` (test double)
- Test: `scripts/herdr/bootstrap.test.ts`

**Interfaces:** the script keeps `set -u`, `log()`, `ensure_ws`, `ensure_maestro` logic (rename it `ensure_conductor`). New: `HERDR_BIN` (default `$HOME/.local/bin/herdr`), `HERDR_FLOOR_SESSION` (default `default`), `HERDR_SUITE_SESSION` (default `Suite`), `DIGISMITH_DEPOT_DIR` (default `$HOME/.digismith-depot`), `DRY_RUN=1` (every mutating herdr call is only logged as `dry-run: <argv>`). Flow per spec 4.3: wait for both sockets; `ensure_ws` Floor `DigiSmith`, `Emma`, `Soveron`; `ensure_ws` Suite `Factory`, `DigiSmith`, `Emma`, `Soveron`; read `conductors.json` with `jq`, for each entry whose `session == "Suite"` and kind in project|factory|standing (and `status != closed`) run `ensure_conductor name suite-ws cwd`, where cwd comes from a table at the top of the script (`Factory`, `DigiSmith` = `$DG_DIR`, `Emma` = `$EMMA_MAESTRO_DIR`, `Soveron` = `$SOV_DIR`) keyed by the project part of the entry key; the conductor is started in a pane of the tab labelled with its name (tab created when missing); env `HERDR_SCOPE=<scopeFor>`, `HERDR_WS=<floor>` (not set for the factory), `DIGISMITH_NAME=<name>`; flags exactly as today (`--name`, `--disallowedTools "Bash(herdr *)"`, `--allowedTools "Bash(herdr-ws *)" "Bash($WS_BIN *)"`). `scopeFor` is computed in bash from the same rule (own `Suite:` workspace plus one `default:<id>` per distinct `floor` and per `default` workspace in the registry) with a test that compares it with `scopeFor` of `registry.ts` on one fixture. After the ensure steps, write the resolved Suite workspace id into each entry's `workspace` (jq to a temp file, `mv`). A `ticket` entry with `status == open` is relaunched (resume with the same session id) but never created. Entries with no `session` field are skipped (still Floor conductors, handled by the old behaviour of this script: when `FLOOR_CONDUCTORS=1` the old `ensure_maestro` block runs for them; default `1` until the migration ends, so the new script is a drop-in replacement before step 6).

**Fake:** `fake-herdr.sh` keeps state in `$FAKE_DIR` (`<session>.ws` lines `wN label`, `<session>.agents` lines `name pane status`), implements `workspace list|create|close`, `tab list|create|rename`, `agent get|list|start|prompt`, `pane run`, and prints the JSON shapes the script reads with `jq` (`.result.workspaces[]`, `.result.workspace.workspace_id`, `.result.agent`). It logs every call to `$FAKE_DIR/calls.log`.

- [ ] **Step 1: Write the failing test** (`bootstrap.test.ts`, runs the script with `HERDR_BIN=<fake>`, temp `HOME`, temp depot with a `conductors.json` of one Suite project entry, one factory entry, one old default entry): after a run, `FAKE_DIR` shows Suite workspaces `Factory DigiSmith Emma Soveron` and Floor workspaces `DigiSmith Emma Soveron`; the two Suite conductors are started in their Suite workspace with `--session Suite` and the flags; the registry `workspace` fields hold the Suite ids; a second run adds no workspace and no agent (idempotent); `DRY_RUN=1` changes nothing and logs `dry-run:` lines; the old default entry still goes through the old path; a `ticket` entry `status: open` with no live agent is NOT created (logged "ticket conductor ... not running, start it with dg conductor start-ticket"); the exported scope string equals `scopeFor` for the fixture.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/bootstrap.test.ts`
- [ ] **Step 3: Write the script and the fake.** Base it on the installed script (`~/.local/bin/herdr-bootstrap.sh`, read it, copy `COMMON_RULES`, the prompts and the relaunch branch verbatim).
- [ ] **Step 4: Run, expect PASS.** Also `bash -n scripts/herdr/herdr-bootstrap.sh`.
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): bootstrap both herdr sessions from the registry"`

### Task 15 (T15): `conductor-watch` with session targets

**Files:**
- Create: `scripts/herdr/conductor-watch` (new text of `~/.digismith-depot/bin/conductor-watch`)
- Test: `scripts/herdr/conductor-watch.test.ts`

**Interfaces:** a target `Suite/emma-conductor` or `Suite/w7:p1` runs `herdr --session Suite agent get <rest>`; a plain target runs `herdr agent get <target>` exactly as today. `--once` prints one `state` line per target. The herdr binary is found on `PATH` (the test puts `fake-herdr.sh` first as `herdr`).

- [ ] **Step 1: Write the failing test:** with a fake `herdr` on `PATH` that logs argv, `conductor-watch --once Suite/emma-conductor emma-conductor` shows calls `--session Suite agent get emma-conductor` and `agent get emma-conductor` (no `--session`); an unreadable target reports `gone`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/conductor-watch.test.ts`
- [ ] **Step 3: Implement** (copy the depot script, change `status()` only; update the docstring `TARGET is ...`).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): watch conductors in the Suite session"`

### Task 16 (T16): runbook text and the install list

**Files:**
- Create: `scripts/herdr/RUNBOOK-SUITE.md` (replacement text, NOT written into `.digismith/sessions/workbox.md`: that file is untracked and edited by the conductor)
- Test: none (text); check by reading.

**Content:** replacement for the runbook sections "Layout", "After a reboot", "Tab cleanup" and the role table lines (`workbox.md:9,24-45,414`): Suite and Floor definitions, the reboot sequence (spec 4.2), where each conductor lives, the ticket-conductor start/close lines, the `HERDR_SCOPE` rule, the "own workers first, cross-use is logged" rule, and one line per script with its install path.

- [ ] **Step 1:** Write the file from spec sections 2, 4.2, 6, 7.2.
- [ ] **Step 2:** Self-check: every path in it exists in the repo or is named as a install target.
- [ ] **Step 3: Commit.** `git commit scripts/herdr/RUNBOOK-SUITE.md -m "docs(dgs-683): add the Suite runbook text"`

---

