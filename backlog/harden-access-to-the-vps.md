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

## Background: the Master identity discussion (moved verbatim from DGS-170 on 2026-10-04)

Jack decided for DGS-170: the Master is whoever holds the SSH key, for now. The longer analysis below is what led there and what the
deferred layers are. It is kept here because DGS-177 is the work that would build them.

- **Authority (SSH key decided for now; the layers below are later).** Whoever can SSH in can already do anything on the VPS, so "the holder of the SSH key" is the right
  trust boundary for *reaching* the Master's client: `herdr attach`, the Desktop app over SSH, an `opencode attach` through an SSH tunnel
  (with its server password). It is **necessary but not enough to prove an order is the Master's**, because every process on the VPS runs
  as the same user (root), including every worker. Today a worker can reach the Desktop maestro only through a labelled peer message,
  which cannot grant escalation, and an approval needs a click in the app. A maestro running in a herdr pane takes `herdr agent prompt`
  as typed input, and a worker (or a prompt-injected one) can send exactly that. So a typed order in a pane looks the same whether the
  Master or a worker sent it. The identity must be proven, not assumed from the channel. One option that matches Jack's idea: the Master's
  client **signs** an order or opens a time-limited Master session with the SSH key (`ssh-keygen -Y sign`), and the maestro verifies it
  against the Master's public key (`ssh-keygen -Y verify`, an `allowed_signers` file). The private key and its passphrase stay on the
  Master's machine, so nothing on the VPS can forge a signature. Routine orders could stay plain text and escalating approvals need a
  signature. Other options: a separate Unix user for the workers, or an out-of-band approval card. To settle in this item.
- **Authority, option: Tailscale (Jack, 11:49 UTC+7, "how about I use it with Tailscale").** Checked on the VPS: Tailscale is not installed;
  `sshd` listens on the public address (port 22) and nothing else listens publicly. With Tailscale: (1) the Master's client and any
  endpoint (an OpenCode server, a web Observer) bind to the tailnet address only, so there is no public port and no SSH tunnel step;
  (2) the endpoint can ask Tailscale who a connection comes from (`tailscale whois`), so it accepts Master orders only from the Master's
  device, and a worker on the VPS, which connects from the VPS's own address, cannot pass as that device; (3) Tailscale SSH can replace the
  SSH key by the tailnet login, with a "check" mode that asks for a fresh sign-in (SSO and 2FA) for root, and port 22 can then be closed.
  Limits: trust moves to the Tailscale account and its coordination server (Headscale is the self-hosted alternative); and the identity
  check has to sit at the maestro's **entry point** (a gateway or server the Master's client calls), not at a pane, because a pane takes
  `herdr agent prompt` from any local process. So Tailscale covers reaching and naming the Master's device; signed orders (above) cover
  an order's authority. They combine. Installing it needs Jack to sign in to the tailnet himself (no auth key is handled by the maestro).
- **Threat: a stolen SSH key (Jack, 11:50 UTC+7: "who knows a hacker could steal my ssh key and impersonate").** Checked on the VPS
  (2026-10-04): `permitrootlogin prohibit-password` and root is the only login-capable account, so root is reachable by key only, even
  though `passwordauthentication` is `yes`; `ufw` is active and allows only OpenSSH; `fail2ban` is not installed. So SSH is key-only in
  practice, and the real risk is theft of the private key. A stolen login key is root on the VPS, which also reads every secret held in
  root-owned files (the TokenReply key, the ClickUp token, the account tokens). Ways to reduce it, cheapest first: (1) put a passphrase on the key (the
  `PasswordAuthentication no` change was declined by Jack), keep the private key out of synced folders (MEGA), use `ssh-add -t` timeouts,
  and no agent forwarding to hosts you do not trust; (2) Tailscale and close public port 22, so a stolen key is useless from outside the
  tailnet (the attacker also needs an enrolled device and your account); (3) a hardware-backed key (FIDO2, `ed25519-sk`, a touch per use):
  it cannot be copied, and a separate one can be the Master's signing key, so a stolen login key still cannot approve an escalation;
  (4) a smaller blast radius: run the maestro and workers as a non-root user and keep secrets readable only by the processes that need
  them; (5) a login alert. SSH alone is a sound boundary for reaching the Master's client; it should not be the only proof of authority for
  an escalating order. The work on the machine itself is DGS-177 (`backlog/harden-access-to-the-vps.md`, C.1: Workbox).
  Earlier wording of the same question: How the Master's word reaches the maestro and workers. A peer message cannot grant escalation, and an approval inside a
  guardrail needs limits the Master writes (the approval guardrail Jack wrote, DGS-155). The Master role has to say how a Master's order is
  told apart from a worker's or another session's message.

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, Authority), [define-the-maestro-role.md](define-the-maestro-role.md)
(DGS-176), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md)
(DGS-174), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151), [vps-cli-named-herdr-session.md](vps-cli-named-herdr-session.md),
the runbook section "Attach from any machine" (it lists the public IP and the SSH hosts), DGS-152.
