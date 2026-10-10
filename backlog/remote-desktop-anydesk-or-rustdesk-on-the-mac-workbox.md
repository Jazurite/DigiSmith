# Explore AnyDesk or RustDesk as the remote desktop for the Mac Workbox

**Status:** Idea, Jack (2026-10-10 14:30 UTC+7 [07:30Z]). ClickUp: **DGS-228** (C.1: Workbox, under DGS-182, task id `14zcebrvcp5`). No design yet.

## Why

Since DGS-227 (2026-10-10), Jack's Windows PC opens the Mac Workbox screen with TigerVNC over Tailscale. It works, but
VNC to macOS 26 has limits that Jack hit in the first hour:

- TigerVNC's native viewer cannot scale. The Mac must run at 2304 x 1440 and the viewer must be full screen to show the
  Dock on a 2560 x 1440 PC screen.
- Trackpad gestures do not pass through. The Dock auto-hide had to be turned off.
- Only VNC password login works from Windows viewers (RealVNC fails on the 4096-bit Apple DH key). A VNC password has
  8 characters at most and old DES encryption. Tailscale encrypts the link, but the login itself is weak.
- A VNC-password viewer has no user identity, so macOS made a frozen login window session until
  `VNCAlwaysStartOnConsole` was set. The fix is a hidden preference that a macOS update can change.

## What to find out

- **RustDesk.** Open source. It can connect by IP with "Direct IP Access" (port 21118), so a connection over the
  Tailscale IP needs no public server. A self-hosted ID and relay server (`hbbs`/`hbbr`) is also possible, on the Workbox
  itself. Check the macOS 26 client: Screen Recording and Accessibility permissions, unattended access at the lock screen
  and the login window, scaling, clipboard, file transfer.
- **AnyDesk.** Closed source. It connects out to AnyDesk's own servers, so the pf anchor does not stop it: anyone with
  the ID and the unattended password can reach the Mac without Tailscale. Find out if AnyDesk can be limited to direct
  connections on the tailnet. Check its security history (AnyDesk disclosed a breach of its production systems in 2024).
- **Both.** The client on the PC and the service on the Mac must both be installed. The idle CPU and power cost of
  the always-on service: the Workbox idles under 2 W today (`~/.digismith-depot/power-probe/probe.sh`). Behavior at the
  login window, where macOS 26's `audiomxd` loop starts (see DGS-182 notes).

## Constraints

- Tailscale-only access stays the rule. A new port (for example 21118) goes in the pf anchor `/etc/pf.anchors/workbox`,
  from `100.64.0.0/10` and `fd7a:115c:a1e0::/48` only.
- Keep TigerVNC working as the fallback until the new tool is proven.
- Jack does the installs and grants the macOS permissions; the permissions need the Mac's screen, so over VNC.

## Related

- DGS-227: Screen Sharing from the Windows PC with TigerVNC (done; all the macOS 26 VNC findings).
- DGS-182 (`macbook-home-server.md`): the Mac Workbox milestone, pf anchor, auto-login, power probe.
