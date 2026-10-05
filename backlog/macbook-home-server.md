# Home server on the old 2019 Intel MacBook: setup checklist and limited access for the company MacBook

**Status:** Idea and a checklist for Jack to do by hand. Jack's call (2026-10-05 07:0x UTC+7 [00:0xZ]). No build. ClickUp: **DGS-182** (list C.1: Workbox, created 2026-10-05 07:08 UTC+7 [00:08Z], task id `14zcebrut3b`).

**Source:** a consultation in the DigiSmith maestro session. Jack postponed the Mac mini to Black Friday (end of November 2026) because of its cost, and is considering his old MacBook (Intel, 2019) as a home server meanwhile. His worries: heat and noise, running it 24/7, a closed lid, and giving his **company MacBook** only limited access to it. He has not opened the MacBook yet and will do the checks and the setup himself at the office. The advice below is the maestro's, from general knowledge, not tested on his machine. Where the maestro was unsure, the text says so.

## What is decided (Jack, 2026-10-05)

- The home MacBook is a **second, non-critical box**. The VPS stays the reliable main machine (home power and internet are less stable).
- **Reach it only over Tailscale**, no port-forwarding.
- Jack sets up the three-layer access (below) himself on the MacBook when he is at the office.

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

## Cautions

- **OpenCode ports.** Do not give the company MacBook an `opencode serve` password: in the DGS-169 spike it was one shared basic-auth password with no per-client roles (only tested, not checked in the docs). Keep OpenCode behind SSH, bound to 127.0.0.1.
- **What the company can see.** Anything shown on the company laptop's screen or typed on it is visible to the employer's monitoring software. Do not show secrets, personal data or ClickUp content on it, and do not put the home PC's key or any token there. Check the company's policy on connecting a managed device to private infrastructure.

## Related work

- **DGS-181** (`depot-process-lifecycle-windows-only.md`): `dg depot` fails on Linux and would fail on macOS too (`tasklist` and the Windows `netstat` parser). If the MacBook becomes a second server, the portable fix should cover macOS (`ps` or `lsof`) as well as Linux and Windows.
- **DGS-177** (`harden-access-to-the-vps.md`): Tailscale, a hardware key, a non-root maestro, a login alert. This item reuses its steps for the MacBook.
- **DGS-170** (`brainstorm-the-new-maestro-role.md`): the Master, Observer and Operator roles that layer 3 implements.
- **DGS-169** (`maestro-in-herdr.md`): a persistent herdr and OpenCode maestro, and the memory finding that makes a 16 GB box useful.
- herdr runs on macOS (a Rust binary); the Workbox runbook is written for this Linux VPS, so a macOS section would be new.

## Open questions

- Which model is it, what RAM, and is the battery swollen or only dead? (the office checklist answers this)
- Does the T2 auto-boot after a power cut work on his model?
- Does the company policy allow the company MacBook to join a personal tailnet?
- What does the company MacBook need to do: only watch, or also send a few orders such as "approve" or "start a worker"? That decides the whitelist in `observer-shell`.
- Does the maestro move to the MacBook later, or does it stay on the VPS and the MacBook only runs workers?
