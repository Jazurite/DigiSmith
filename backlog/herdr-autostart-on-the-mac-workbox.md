# herdr does not come back after a reboot of the Mac Workbox

**Status:** Idea, Jack (2026-10-07 15:00 UTC+7 [08:00Z]). ClickUp: **DGS-190** (C.1: Workbox, task id `14zcebrv3j4`). No design yet.

## Why

On 2026-10-07 the 2019 MacBook (`workbox`) was set up as a headless server: SSH keys only, SSH and Screen Sharing reachable
only over Tailscale (a pf anchor), never sleeps, lid closed allowed. Jack chose **no auto-login**, so after a reboot the
Mac waits at the login window. tailscaled and sshd are system daemons and come back; nothing in Jack's user does. herdr,
its sessions (`DigiSmith`, `emma`, `Soveron`) and their workers stay down until someone logs in over SSH and starts them
by hand. A power cut or a macOS update is enough to stop all work silently.

## What to find out

- How herdr's server starts (`herdr server ...`, `~/.config/herdr/herdr-server.log`) and whether it can run with no
  terminal attached, from `launchd`.
- What `~/.config/herdr/session-snapshots` restores: the sessions and panes only, or the agents too.
- Whether a worker's `claude` login works with no GUI login. On macOS the login may live in the Keychain, which is locked
  until the user logs in (see DGS-182, "the Claude login may live in the Keychain"). A setup-token login avoids that.

## Shape (to confirm)

- A system `LaunchDaemon` with `UserName` = `workbox` (a `LaunchAgent` needs a login, so it does not fit), `RunAtLoad`,
  started after the network and Tailscale are up.
- It starts the herdr server and restores the sessions, but does not resume agents on its own: after a reboot the
  maestro shows the list and asks Jack, as after a flux (DGS-154).
- A reboot test: reboot, wait, `ssh workbox@workbox`, check `herdr` lists the sessions.

## Related

- DGS-182 (`macbook-home-server.md`): the move to the MacBook, `launchd` instead of systemd.
- DGS-184 (`root-paths-on-the-mac-workbox.md`): `/root` paths that break on the Mac.
- DGS-181 (`depot-process-lifecycle-windows-only.md`): process lifecycle on macOS.
