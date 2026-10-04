# Harden access to the VPS: SSH, Tailscale, a hardware key, a non-root maestro, a login alert

**Status:** Idea, Jack's call (2026-10-04 11:53 UTC+7 [04:53Z]): "Make a backlog for the E clan or is it A clan?" The maestro placed it in **C: Platform,
C.1: Workbox** (the VPS the Workbox runs on). Not E (Methodology) and not A (System). B.1: VPS Hosting is empty, and DGS-152 moves that
clan's tickets into C. No design yet. ClickUp: **DGS-177** (list C.1: Workbox, created 2026-10-04 11:53 UTC+7 [04:53Z], task id `14zcebruqu6`).

**Source:** the DGS-170 discussion of the Master's identity (Jack: "whoever holds the SSH key ... is classified as Master", then "a hacker
could steal my SSH key and impersonate"). A stolen login key is root on the VPS and every secret that root can read. DGS-170 decides what
proves the Master's authority. This item is the **work on the machine** that makes any of those answers safe.

## What is true today (checked on the VPS, 2026-10-04)

- `permitrootlogin prohibit-password`, and root is the only login-capable account: root is reachable by key only.
- `passwordauthentication yes` (harmless today because no other account can log in; Jack declined to change it, see step 1).
- `ufw` is active and allows only OpenSSH from anywhere. `fail2ban` is not installed. Tailscale is not installed.
- Every process (the maestro, every worker, every herdr pane) runs as root. Secrets sit in root-owned files: the TokenReply key, the
  ClickUp token, the Claude account tokens. The maestro never reads them (guardrail), but any process running as root can.

## Steps, cheapest first

1. **Free, now** (the `sshd` change is declined; the rest is advice for Jack's own machine):
   - ~~Set `PasswordAuthentication no` in `sshd_config`.~~ **Declined by Jack (12:01 UTC+7 on 2026-10-04): "we are not going to do
     `PasswordAuthentication no`."** It stays `yes`. Root still cannot log in by password (`PermitRootLogin prohibit-password`) and no other
     account can log in, so nothing changes in practice. Do not propose it again unless something changes (a new login account, or
     `PermitRootLogin` is touched).
   - A passphrase on the login key. The private key kept out of synced folders (MEGA). `ssh-add -t` timeouts. No agent forwarding to hosts
     Jack does not trust.
2. **Tailscale and close public port 22.** A stolen key is then useless from outside the tailnet. Endpoints (an OpenCode server, a web
   Observer) bind to the tailnet address only. `tailscale whois` names the caller's device. Tailscale SSH with a "check" mode asks for a fresh
   sign-in (SSO and 2FA). Jack signs in to the tailnet himself; no auth key is handled by the maestro. Trust moves to the Tailscale
   account (Headscale is the self-hosted option).
3. **A hardware-backed key** (FIDO2, `ed25519-sk`, a touch per use). It cannot be copied. A separate one is the Master's **signing** key for
   escalating orders (`ssh-keygen -Y sign` and `-Y verify` with an `allowed_signers` file), so a stolen login key cannot approve a push or
   a ClickUp write.
4. **A smaller blast radius.** Run the maestro and the workers as a non-root user. Make each secret readable only by the process that needs
   it. This changes how herdr sessions, the depot, and `claude-account` run, so it is the largest step.
5. **A login alert,** so Jack hears about a new SSH session. `fail2ban` is optional once port 22 is closed.

## Open questions

- Which of 1 to 5 now, and in what order? Steps 1 and 2 are small; 3 waits for the Master's client (DGS-174); 4 is its own project.
- Does Tailscale replace the SSH key for the Desktop app's remote sessions, or sit beside it? The Desktop app connects over SSH today.
- What breaks if the maestro and workers stop being root (the herdr sockets, `~/.digismith-depot`, `claude-account`)?
- A second machine as a fallback way in, if the tailnet or the key is lost.

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, Authority), [define-the-maestro-role.md](define-the-maestro-role.md)
(DGS-176), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md)
(DGS-174), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151), [vps-cli-named-herdr-session.md](vps-cli-named-herdr-session.md),
the runbook section "Attach from any machine" (it lists the public IP and the SSH hosts), DGS-152.
