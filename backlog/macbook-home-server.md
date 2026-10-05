# The old 2019 Intel MacBook becomes the main machine: setup checklist, the move off the VPS, and limited access for the company MacBook

**Status:** Idea and a checklist for Jack to do by hand. VPS state archived 2026-10-05 (see "Progress: state archived on the VPS"); the setup on the MacBook has not started. Jack's call (2026-10-05 07:0x UTC+7 [00:0xZ]); the MacBook was made the **main machine** at 07:3x because the Hetzner VPS subscription will not last. No build. ClickUp: **DGS-182** (list C.1: Workbox, created 2026-10-05 07:08 UTC+7 [00:08Z], task id `14zcebrut3b`).

**Source:** a consultation in the DigiSmith maestro session. Jack postponed the Mac mini to Black Friday (end of November 2026) because of its cost, and is considering his old MacBook (Intel, 2019) as a home server meanwhile. His worries: heat and noise, running it 24/7, a closed lid, and giving his **company MacBook** only limited access to it. He has not opened the MacBook yet and will do the checks and the setup himself at the office. The advice below is the maestro's, from general knowledge, not tested on his machine. Where the maestro was unsure, the text says so.

## What is decided (Jack, 2026-10-05)

- ~~The home MacBook is a second, non-critical box. The VPS stays the reliable main machine.~~ **Reversed 2026-10-05 07:3x UTC+7 [00:3xZ] (Jack): the MacBook is the main machine.** The VPS is a Hetzner server on a subscription Jack cannot keep for long, so the Workbox, the maestros and the workers move to the MacBook. See "The MacBook is the main machine" below. The Mac mini on Black Friday may replace it later.
- **Reach it only over Tailscale**, no port-forwarding.
- Jack sets up the three-layer access (below) himself on the MacBook when he is at the office.
- **Revised 2026-10-05 07:2x:** the company MacBook gets temporary near-full interaction (a 4-hour window), not the read-only Observer. See "Revised: temporary full-interaction access" below; layer 3 (Observer) stays as the strict option.

## The MacBook is the main machine (Jack, 2026-10-05 07:3x UTC+7 [00:3xZ])

The VPS (Hetzner, `ubuntu-4gb-nbg1-2`) is paid by subscription and Jack cannot keep it for long, so the MacBook becomes the main machine, with the Mac mini as a later upgrade. This changes how seriously each risk below must be taken: a second box can fail, the main machine cannot fail silently.

- **Reliability work moves from "nice" to "required":** a replaced or removed battery decision, the fan and thermal burn-in, the power-cut auto-boot test, a **UPS or at least a surge protector** (the maestro's suggestion, not discussed), and **backups** of the repos (pushed to GitHub), `~/.digismith-depot`, the maestro notes, the runbook (untracked on purpose) and the ClickUp credentials file. The VPS has the same single copy today.
- **Home network:** Tailscale makes a changing home IP irrelevant. A router or internet outage still stops everything, so keep a phone hotspot or a cheap fallback in mind.
- **Move the whole Workbox, not only a box.** The runbook (`.digismith/sessions/workbox.md`) is written for this Linux VPS: herdr, `claude-account`, the usage probe, the `pnpm` global install, `/root` paths and the `herdr.sock` locations. macOS needs its own section (home folder, `launchd` instead of systemd, different paths). Also the seats' setup-token logins and the SSH keys must be re-created on the MacBook, never copied through a channel you do not control.
- **`dg depot` must work on macOS before the move** (DGS-181). It is no longer optional: `dg depot ensure` and `stop` start the OpenCode server and the bridge. macOS has `ps` and `lsof`, not `tasklist` or `taskkill`.
- **Whole-day tasks the VPS does:** the maestro sessions (Desktop sessions over SSH today), the herdr sessions (`DigiSmith`, `emma`, `Soveron`), the cron reminders, the OpenCode reviewer (Sol). List them and decide where each lives after the move. The Claude Desktop app reaches the VPS over SSH today; it would reach the MacBook the same way.
- **Timing question for Jack:** when does the Hetzner subscription end? That date sets how long the move can take, and whether the MacBook must be ready before Black Friday (end of November 2026).

## Migration from the VPS: inventory and plan (maestro, 2026-10-05 08:0x UTC+7 [01:0xZ])

Jack: "we need to come up with a way to migrate the current data from the Hetzner VPS to my MacBook." The maestro ran a **read-only inventory** (sizes and names only; no credential file was opened). Nothing was moved or deleted. The plan below is a proposal; Jack has not approved it yet.

**Urgent, found on the way: the VPS disk is 99% full** (35 of 38 GB, 718 MB free). It can break git writes and workers. About 3.3 GB is regenerable cache (`~/.npm` 1.1 GB, `~/.cache` 2.2 GB, plus the pnpm store). Jack said "check later", so nothing was cleared: ask him again.

### What is on the VPS (measured)

- **No services.** No crontab for root, no custom systemd units, only sshd listening (port 22). The VPS holds files, herdr, Claude sessions and tools, so there is nothing to port except tools and state. (A Claude cron reminder is session-only and not on the machine.)
- **Sizes** (without `node_modules`): `~/Workspace` 14 GB (15 GB with `.git`), `~/Obsidian` 3.4 GB (5.7 GB with `.git`), `~/.claude` 1.3 GB, `~/.local` 2.7 GB (`share` 3.3 GB), `~/.cache` 2.2 GB, `~/.npm` 1.1 GB, `~/.megaCmd` 498 MB, `~/.nvm` 222 MB, `~/.digismith-depot` 7 MB, `~/.config` 808 KB, `~/.ssh` 32 KB.
- **Biggest in Workspace:** `Programming/AI` 5.7 GB (`genix` 2.5 GB, `gradion-brain` 2.5 GB, `arsenAI` 393 MB, `LLM-for-RFP` 386 MB), `Programming/Company` 3.2 GB, `Emma/shopify-template-jp` 665 MB, `Emma/shopify-hub` 570 MB, `Programming/Library` 512 MB, `Programming/Experiments` 533 MB, `Emma/_backup-ph-kr-2026-10-02` 421 MB. The DigiSmith repo is 95 MB plus 109 MB of `.worktrees`.
- **Repos with a GitHub remote:** `Jazurite/DigiSmith` (`git@github.com:Jazurite/DigiSmith.git`) and the Emma repos `shopify-hub`, `shopify-template-jp`, `-kr`, `-in`, `-ph` (host alias `github-emma`, key `~/.ssh/emma`, account `hieu-huynh-emma`). Their unpushed counts were 0 where an upstream is set. A few have 1 to 2 uncommitted files (kr, in, ph). The `_backup-ph-kr-2026-10-02/*.old` copies have 10 dirty files each.
- **Git repos with NO remote** (the history exists only on the VPS): the Obsidian vaults `Knowpolis` (51 dirty), `Knowpolis/1. Soveron` (38), `Knowpolis/3. DigiSmith` (2), `Housembly` (15), `Knowpolis - Copy` (8), `Knowpolis - Copy/3. Fluxor` (108), plus `gradion-logwork-cli` and the PR review clones (`-pr647-review`, `-pr1050-review`, `-pr193-review`, `-pr625-review`) and `Workspace/.debris/*`. Emma folders such as `storefront` and `shopify-template-ca` arrived without `.git`.
- **MEGA is already a replication channel** (`mega-sync`): `/root/Workspace` to `/Workspace` (12.43 GB, 246,589 files, **Syncing**, with a warning "Sync issues detected: your syncs have encountered conflicts"), `/root/Obsidian` to `/Obsidian` (5.25 GB, **Synced**), and a leftover test sync `/tmp/cl...t-local` to `/vps-ex...on-test`. Earlier notes say `.git` is **not** synced by MEGA, so MEGA carries working files only and the vault history is not backed up anywhere.
- **Claude state:** `~/.claude/projects/` has one folder per working path (`-root-Workspace-Jazurite-DigiSmith`, `-root-Obsidian-Knowpolis-1--Soveron`, the five Emma repos, and `-root`). The maestro's memory lives in `…/-root-Workspace-Jazurite-DigiSmith/memory/`.

### What moves, and how

| Item | How |
|---|---|
| Code with a GitHub remote | `git clone` on the MacBook (not a copy). First commit and push the dirty files, or save them as a patch. |
| Untracked repo state: `.digismith/sessions/` (runbook, briefs, notes, worker folders, 4 MB), `.digismith/docs/E/E.4/node-kicker-spike/`, any `.env` | `rsync` over Tailscale (VPS to MacBook). The runbook stays untracked on purpose. |
| Obsidian vaults with no remote | Best: give each a **private GitHub remote** and push the history before the move. Otherwise `rsync` the `.git` too. MEGA brings the files only. |
| Big folders (`Programming/*`, 12 GB) | Triage first: what the MacBook needs, and what stays archived in MEGA. MEGA selective sync can carry the rest. |
| The maestro's memory | Copy the `memory/` folder to the **new path key** Claude derives on the MacBook (for example `-Users-<name>-Workspace-Jazurite-DigiSmith`). The key follows the working path, so the same folder under the old key is not found. |
| `~/.digismith-depot` (7 MB: the backlog-sync script, usage probe, captures, `.env` with the ClickUp credentials) | Copy the scripts with `rsync`. Create `.env` again on the MacBook, or copy it **directly VPS to MacBook** over Tailscale. Never through chat, MEGA or a commit. |
| Claude seats (`jack`, `dev0`) | Run `claude setup-token` again for each seat on the MacBook. Do not copy tokens. `claude-account` is a custom Linux script: port it. |
| SSH keys (`~/.ssh`, including `~/.ssh/emma`) | Generate **new** keys on the MacBook and add the public keys to GitHub (and the Emma account). Do not copy private keys. |
| OpenCode (`~/.local/share/opencode`, `~/.config/opencode`) | Do not migrate the session database. Log in again (the TokenReply key is in its config: do not copy it blindly). |
| herdr (`~/.config/herdr`, the `DigiSmith`, `emma`, `Soveron` sessions) | Install herdr on the MacBook and recreate the sessions. The state is not portable. |
| Regenerable: `~/.npm`, `~/.cache`, `~/.nvm`, the pnpm store, `.worktrees`, `node_modules`, Claude plugin caches | Do not move. Reinstall. |
| Resume IDs | Do not carry over. A worker has no resume by design. The maestro resumes from its handoff note, and Desktop maestro sessions on the new host start fresh with "Arise". |

### Traps (found in the inventory)

- **Hard-coded `/root/...` paths:** the backlog sync script (`~/.digismith-depot/backlog-sync/sync.py` points at `/root/Workspace/Jazurite/DigiSmith/packages/cli/dist/index.js`), the runbook, briefs, permission rules and skills. Replace with `$HOME` or repo-relative paths before the move. A ticket for this is worth filing.
- **Claude's per-path memory key** (above).
- **`claude-account` and the usage probe** are Linux scripts; the status-line rate-limit probe may work on macOS but is untested.
- **`dg depot` does not work on macOS yet** (DGS-181 must add it; it blocks the move).
- **The Desktop app** reaches the VPS over SSH today; it must be pointed at the MacBook, and the Desktop maestro sessions stored under `~/.claude/remote` on the VPS do not move.
- **The vaults' `.git` history exists only on the VPS** (no remote, not synced by MEGA). If the VPS ends first, that history is lost.

### Plan (proposed)

1. **Prep on the VPS (now):** free the disk (caches), commit and push the dirty repos, give each vault a private GitHub remote and push, fix the MEGA conflicts and remove the leftover test sync, remove the `/root` hard-codes, and write down the secrets that must be re-created (not copied).
2. **Build the Workbox on the MacBook** (after DGS-181 and the office checklist): Tailscale, herdr, claude, pnpm and Node, `dg`, new SSH keys, new seat logins. Clone the repos. `rsync` the small untracked state. Let MEGA bring the large folders.
3. **Dry run:** run one small ticket end to end on the MacBook (a worker plus the maestro) while the VPS stays live.
4. **Cutover:** freeze the VPS (no new workers), final push and `rsync`, point the Desktop app and the herdr sessions at the MacBook, update the runbook, memory and `MEMORY.md`.
5. **Keep the VPS read-only** until the Hetzner subscription ends. Before it ends, take a final archive (a Hetzner snapshot, or a `tar` into MEGA). Verify a restore of one vault before cancelling.
6. **Back up the MacBook** (it is now the single copy): GitHub for repos, a second disk or cloud bucket for the rest.

### Decisions pending (Jack)

- **Clear the VPS caches now?** (~3.3 GB; the disk is at 99%.) Jack said "check later".
- **Vault history:** push each vault to a private GitHub repo, or `rsync` the `.git` folders?
- **Which `Programming/*` folders move** (`genix` and `gradion-brain` are 2.5 GB each) and which stay archived in MEGA?
- **When the Hetzner subscription ends** (it sets the deadline).

## Progress: state archived on the VPS (maestro, 2026-10-05 11:1x to 11:3x UTC+7 [04:1xZ to 04:3xZ])

Jack reset the MacBook ("Workbox") and asked for the VPS state to be archived for it. Jack decided: MEGA stays the channel for working files, GitHub carries `.git` for repos that have a remote, and the credentials go in **one separate archive** that Jack deletes after the move. Everything below sits in `/root/Workspace/_vps-state/` (outside the repo, so MEGA syncs it with the Workspace folder). No file was opened; the maestro only listed the archive contents.

| File | Size | Holds |
|---|---|---|
| `vps-home-state.tar.gz` | 53 MB | `~/.claude/projects` (maestro memory and transcripts, all working paths), `~/.claude/settings.json`, `~/.digismith-depot` (without `.env`, `repo/`, logs), `~/.config/herdr` (sockets skipped) |
| `vps-small-files.tar.gz` | 5 KB | `~/.bashrc`, `~/.profile`, `~/.gitconfig`, `~/.local/bin/claude-account`, `~/.config/git`, `~/.config/pnpm` |
| `vps-ssh.tar.gz` (mode 600, **secrets, unencrypted**) | 19 KB | `~/.ssh` (GitHub and Emma keys), `~/.digismith-depot/.env` (ClickUp), `~/.claude/.credentials.json`, `~/.config/opencode` (TokenReply key; no `node_modules`), `~/.config/gh`, `gh_token.env`, `tokenreply.env`, `claude-code.env`, `~/.config/claude-accounts` (both seat tokens) |
| `unpack.sh` | 3 KB | the script that unpacks all three on the MacBook |

**Left out on purpose:** `~/.claude/remote` (1 GB of Desktop session state), `~/.claude/plugins` (reinstall), `~/.digismith-depot/repo` (re-clone), the OpenCode session database, `~/.cache`, `~/.npm`, `~/.nvm`, `~/.local`, `.worktrees`, `node_modules`.

**The maestro advised against putting the credentials in MEGA** (the earlier plan said "never through MEGA"). Jack decided to do it anyway. The mitigation is the separate archive: delete it from the MEGA cloud as well as the local folder as soon as the MacBook works, and rotate the Claude seat tokens, the `gh` token and the TokenReply key if it stays longer than a day. A passphrase (`openssl enc`) was offered and not taken up.

**`unpack.sh`** (run on the MacBook from the folder with the archives; `--dry-run` changes nothing). It was tested on the VPS against a throwaway home folder (unpack, permissions, the project-folder rename), not on a Mac:
1. Checks that the three archives exist and are not corrupt.
2. Copies every existing file the archives would overwrite to `~/.vps-unpack-backup-<timestamp>/`.
3. Unpacks all three into `~`.
4. Sets 700 on `~/.ssh`, `~/.config/gh` and `~/.config/claude-accounts`, 600 on their files and on the `.env`, `.credentials.json` and `opencode.json` files, and 755 on `claude-account`.
5. Deletes the VPS's `~/.ssh/authorized_keys` so the VPS keys cannot log in to the MacBook.
6. Renames `~/.claude/projects/-root-*` to the new path key (`-Users-<name>-...`; every non-alphanumeric character becomes `-`). It assumes the same `~/Workspace/...` layout; any other layout needs a manual rename of the DigiSmith memory folder.
7. Lists files that still contain `/root/` paths and prints the next steps. It never deletes the secrets archive.

**Known gaps in the archive**
- On macOS the Claude login may live in the Keychain, so the copied `.credentials.json` may do nothing. Fall back to `claude setup-token`.
- `~/.bashrc` and `~/.profile` come from Linux and macOS uses zsh: merge by hand.
- `claude-account` has four long-string lines that were not read. Look at the script before leaving the archive in MEGA.
- `opencode.json` may carry Linux paths. Run `npm install` in `~/.config/opencode` to restore `node_modules`.

### Setup on the MacBook (Jack, by hand; not started)

The full step-by-step guide is `MAC-SETUP.md` (12 steps, from first boot to a reboot test; attached to this ticket and kept in `/root/Workspace/_vps-state/`). The short list:

1. Install Tailscale, MEGA (log in again), herdr, `claude`, Node, pnpm and `dg`.
2. Clone the repos from GitHub (the Emma repos through `github-emma`). Create the `forge` standard user if the non-admin setup is still wanted.
3. Recreate the herdr sessions (`DigiSmith`, `emma`, `Soveron`). Their state does not move.
4. Reinstall the Claude plugins.
5. Run `bash unpack.sh --dry-run`, then `bash unpack.sh`; test `ssh -T git@github.com`, `ssh -T git@github-emma` and `claude`.
6. Delete `vps-ssh.tar.gz` (MEGA cloud and local) and rotate the tokens as above.

### Still open on the VPS

- **Vault history:** the Obsidian vaults, `gradion-logwork-cli` and the PR review clones have no remote and MEGA skips `.git`. Jack has not chosen between a private GitHub repo each and archiving the `.git` folders.
- Uncommitted files in the `-kr`, `-in` and `-ph` repos and the `.old` backup copies (10 each).
- ~~`.digismith/docs/E/E.4/node-kicker-spike/` is still untracked in DigiSmith.~~ Committed as `kicker.mjs` (`d87384a`, 2026-10-05).
- The disk is still at 99% (about 600 MB free after the archives); the ~3.3 GB of caches are uncleared.
- The MEGA Workspace sync still reports conflicts, and the leftover test sync is still listed.
- DGS-181 (`dg depot` on macOS) still blocks the move. The hard-coded `/root/` paths in the depot scripts and runbook are not fixed.

## Why it can work

- Our work is mostly waiting (Claude Code and OpenCode workers call APIs, plus light git and Node). An Intel MacBook idles at about 5 to 10 W (the maestro's estimate; 8 to 15 W with light load), so fans stay off or quiet and the yearly electricity cost is small. Heat and noise appear only under sustained CPU load (local builds, local models).
- **RAM fixes the real constraint.** The DGS-169 spike found the VPS (3.7 GB) is memory-bound: an OpenCode server plus one TUI is about 600 MB and growing. A 2019 MacBook has 8 to 32 GB, so 16 GB or more ends that squeeze.
- **Not for local models.** A 7B model quantized to 4-bit would run on the CPU at roughly 2 to 6 tokens per second (a rough guess), needs 16 GB RAM, and keeps all cores busy: loud and hot. For local models, wait for the Mac mini (M-series).

## The risks, and what to do

- **Battery (Jack: it is lost).** A dead or worn battery is fine if it is not swollen. At 24/7 a worn cell held at full charge in a warm case is the classic swelling case. If the case or trackpad bulges, do not run it 24/7 until the battery is removed or replaced (a replacement is roughly 80 to 150 dollars, a guess). Some 2016+ MacBooks throttle the CPU hard when the battery is dead or missing: test it.
- **Closed lid: do not.** macOS sleeps on lid close unless an external display is attached; a dummy HDMI plug or `sudo pmset -a disablesleep 1` works around it (not confirmed on every Intel model), and the machine runs hotter because the vents sit near the hinge. **Run with the lid open and the display asleep**, on a stand or stood vertically. Display sleep after 1 minute turns the backlight off.
- **Power cut.** The maestro first said a laptop may stay off after an outage, then corrected it: 2018 and newer MacBooks with the T2 chip are reported to boot on their own when AC is connected or the lid opens. Test it (check 3 below).
- **Fans and dust.** Clean once or twice a year, keep it in a cool, ventilated spot. Dried thermal paste is the usual cause of a 2019 laptop getting hotter over time.
- **Updates.** Intel Macs are near the end of macOS support (the maestro is not certain of the date), so security updates will thin out. Set updates to notify, not to install on their own, because they reboot it.
- **Thermals by model.** The 16" i9 2019 is the notorious hot one. A 13" i5 is fine at idle but throttles under load.

## Checklist for the office (about five minutes; send the answers to the maestro)

1. **Model and specs:** Apple menu, About This Mac. Note screen size, year, CPU and RAM.
2. **Battery:** `system_profiler SPPowerDataType` for condition, cycle count and "Service Recommended". Look at the case and trackpad for bulging.
3. **Power-cut test:** shut down, unplug, replug the charger. Does it boot by itself?
4. **Remote Login:** System Settings, General, Sharing, Remote Login on. Check that FileVault is off (with it on, a reboot waits for a password before SSH works).
5. **Power features:** `pmset -g cap` shows what the machine supports.
6. **Burn-in:** run three or four CPU-heavy processes for an hour and watch fan speed and temperature (Macs Fan Control works on Intel). If it stays quiet and cool, normal worker load is fine.

## Settings for the box (with `pmset`; test them, some options differ by model)

- No system sleep, disk sleep off, wake on network on, display sleep after 1 minute.
- Try `autorestart 1` (laptops often lack it; `pmset -g cap` shows).
- FileVault off for the server, Tailscale installed, Remote Login limited to the users who need it (System Settings, Sharing, Remote Login, "Allow access for").

## Limited access for the company MacBook: three layers (Jack does this at the office)

Treat the company MacBook as a less-trusted client. Tightest layer first.

**1. Network (Tailscale ACLs).** Put the server and each client in the tailnet with tags (for example `tag:server`, `tag:home`, `tag:work`). Allow `tag:work` to reach only the server's SSH port (22), and nothing else. Use a personal Tailscale account, and check the company's policy first: a company laptop may not be allowed to join an outside network. Check the exact policy syntax in Tailscale's docs. A starting shape:

```json
{
  "tagOwners": { "tag:server": ["autogroup:admin"], "tag:home": ["autogroup:admin"], "tag:work": ["autogroup:admin"] },
  "acls": [
    { "action": "accept", "src": ["tag:home"], "dst": ["tag:server:*"] },
    { "action": "accept", "src": ["tag:work"], "dst": ["tag:server:22"] }
  ]
}
```

**2. Identity (one SSH key per device).** Generate each key on its own device so it never leaves it (`ssh-keygen -t ed25519`). Revoking a device is deleting one line on the server. Later, a hardware key for the home PC (DGS-177).

**3. Authorization (the real limit).**

- Create a separate standard user on the server, for example `observer`, with no sudo and no admin rights (System Settings, Users & Groups).
- Pin its key in `/Users/observer/.ssh/authorized_keys` (directory mode 700, file mode 600) with a forced command:

  ```
  restrict,from="100.64.0.0/10",command="/usr/local/bin/observer-shell" ssh-ed25519 AAAA... work-macbook
  ```

  `restrict` turns off port forwarding and a terminal. `command=` runs one wrapper whatever the client types. `from=` limits the source to the Tailscale range.
- The wrapper `observer-shell` reads `$SSH_ORIGINAL_COMMAND` and allows only a short whitelist, for example `status` (maps to `herdr agent list`) and `read <pane> [lines]` (maps to `herdr pane read`). It checks the pane name against a strict pattern (letters, digits, `:`, `_`, `-`) and refuses everything else. This is the **Observer** of DGS-170.
- herdr's socket belongs to the user that runs the maestro, so the wrapper reaches it with `sudo` as that user. Allow in sudoers **only the wrapper script by its full path**, not `herdr` with a wildcard: a sudo wildcard lets the caller append extra arguments.
- The **home PC key is the Operator**: the only one allowed to run `herdr agent prompt`.
- Test from the company MacBook: allowed commands work, and a shell, `herdr agent prompt`, a port forward and `sudo` all fail. Log the forced commands, and add a login alert (DGS-177 step 5).

## Revised: temporary full-interaction access for the company MacBook (Jack, 2026-10-05 07:2x UTC+7 [00:2xZ])

Jack: not an Observer. The company MacBook should have **close to full permission to interact** (the panes, the flows, the sessions), but **not** root-level damage (`sudo rm`, `sudo` export, data dumps), and only for a **limited time, for example a 4-hour window**. The Observer in layer 3 above stays as the strict, read-only option for a different time.

**A hard fact first.** Full interaction with the agents is full power as the user they run as: `herdr pane run` runs any shell command in a pane, and `herdr agent prompt` can ask an agent to do anything its tools allow. So a blacklist of "dangerous commands" in a forced command or a shell does not hold (the agent is the bypass). The boundary has to be the **operating-system user, the time limit, a kill switch and recoverability**, not command filtering.

**The design**

1. **A dedicated standard (non-admin) user runs the maestro, herdr and the workers**, for example `forge`. No sudo and no admin rights. That blocks `sudo rm`, `sudo` export and any system-level damage for everyone who logs in as it, including the home PC. (The VPS runs everything as root today; the MacBook should not copy that.)
2. **Short-lived SSH certificates for the company MacBook.** Jack's home PC holds an OpenSSH certificate authority key (kept on a hardware key, or a passphrase-protected file). The company MacBook has its own key pair, made on that laptop. For each window, the home PC signs the company MacBook's public key with a 4-hour validity. The server trusts the CA, and the cert stops working at the end of the window with nothing to remember to clean up.
   - Server (check the exact path and include rules on macOS): `TrustedUserCAKeys /etc/ssh/work_ca.pub` and `AuthorizedPrincipalsFile /etc/ssh/principals/%u`, with the principal `work` listed in `/etc/ssh/principals/forge`.
   - Grant, on the home PC:
     `ssh-keygen -s ~/.ssh/work_ca -I "work-macbook-$(date +%F-%H%M)" -n work -V +4h -O no-port-forwarding -O no-agent-forwarding -O no-x11-forwarding -O force-command="/usr/local/bin/timed-shell" work_macbook.pub`
     This writes `work_macbook-cert.pub`. The cert is not secret (it is useless without the private key), so it can travel by any channel.
   - **The cert is checked only at login.** An open session would outlive the window, so `timed-shell` ends the shell at 4 hours (for example `perl -e 'alarm 14400; exec @ARGV'`). Test that processes the shell started are also gone, and that herdr's own daemon is not.
   - The home PC keeps its own long-lived key (a hardware key, DGS-177) in `authorized_keys`.
   - Newer OpenSSH has an `expiry-time` option for `authorized_keys`, but the maestro is not certain which version added it or which one macOS ships. Certificates are the proven route.
3. **A kill switch.** Revoke at once with an OpenSSH revocation list (`RevokedKeys`), and suspend the device in the Tailscale admin console. Keep the Tailscale ACL from layer 1: `tag:work` reaches only SSH port 22.
4. **A record and an alert.** Log each login (the cert's identity string carries the date and time) and add the login alert from DGS-177. For a keystroke record, run the session under `script`.
5. **Recoverability instead of prevention.** What the `forge` user can delete, a 4-hour session can delete. Keep every repo pushed to GitHub, and back up `~/.digismith-depot` and the maestro's notes (Time Machine or `restic`).

**What a window can and cannot do**

| Can (as `forge`) | Cannot |
|---|---|
| Read and drive panes, prompt agents, start and stop workers, use `dg`, git, ClickUp, files in `forge`'s home | `sudo`, change system settings, other users' files, reach other ports on the tailnet |
| Delete or change `forge`'s own files (repos, notes, depot) | Stay logged in past 4 hours, or log in again without a new cert |
| Read the tokens `forge` can read (Claude, GitHub, ClickUp) | Use a token the maestro keeps out of `forge`'s reach |

**The choice left to Jack.** A 4-hour session can read the tokens in `forge`'s home, and the company MacBook's monitoring may see them on screen or in transit. Options: accept it and use narrowly scoped tokens that can be rotated, or keep secrets under another user that only the workers reach through a small broker. The first is far simpler. Never `cat` a secret in that session, and rotate the tokens if the company MacBook is ever compromised.

## Cautions

- **OpenCode ports.** Do not give the company MacBook an `opencode serve` password: in the DGS-169 spike it was one shared basic-auth password with no per-client roles (only tested, not checked in the docs). Keep OpenCode behind SSH, bound to 127.0.0.1.
- **What the company can see.** Anything shown on the company laptop's screen or typed on it is visible to the employer's monitoring software. Do not show secrets, personal data or ClickUp content on it, and do not put the home PC's key or any token there. Check the company's policy on connecting a managed device to private infrastructure.

## Related work

- **DGS-181** (`depot-process-lifecycle-windows-only.md`): `dg depot` fails on Linux and would fail on macOS too (`tasklist` and the Windows `netstat` parser). The MacBook is now the main machine, so the portable fix **must** cover macOS (`ps` or `lsof`) as well as Linux and Windows, and it blocks the move. Jack's rule stays: Linux first, keep Windows working; macOS is added.
- **DGS-177** (`harden-access-to-the-vps.md`): Tailscale, a hardware key, a non-root maestro, a login alert. This item reuses its steps for the MacBook.
- **DGS-170** (`brainstorm-the-new-maestro-role.md`): the Master, Observer and Operator roles that layer 3 implements.
- **DGS-169** (`maestro-in-herdr.md`): a persistent herdr and OpenCode maestro, and the memory finding that makes a 16 GB box useful.
- herdr runs on macOS (a Rust binary); the Workbox runbook is written for this Linux VPS, so a macOS section would be new.

## Open questions

- Which model is it, what RAM, and is the battery swollen or only dead? (the office checklist answers this)
- Does the T2 auto-boot after a power cut work on his model?
- Does the company policy allow the company MacBook to join a personal tailnet?
- ~~What does the company MacBook need to do: only watch, or also send orders?~~ Answered 2026-10-05: near-full interaction for a 4-hour window.
- Tokens in `forge`'s home: accept the exposure with narrowly scoped, rotatable tokens, or add a broker under another user? (see the revised section)
- Is the 4-hour window fixed, or chosen at each grant? Does an extension need a new cert from the home PC each time?
- ~~Does the maestro move to the MacBook later, or stay on the VPS?~~ Answered 2026-10-05: the MacBook is the main machine, so the maestros and workers move to it.
- When does the Hetzner subscription end, and what must be moved by then (see "The MacBook is the main machine")?
- A UPS and a backup target for the main machine: which, and where do the backups go (GitHub for repos; a second disk or a cloud bucket for the rest)?
