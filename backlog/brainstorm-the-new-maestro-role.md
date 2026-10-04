# Define the Master role (the user's role)

**Status:** Idea, Jack's call (2026-10-04): "we need another backlog item to brainstorm the new role". Narrowed by Jack at 11:40 UTC+7 [04:40Z]:
"Decouple the maestro change to another ticket. 170 fully focus on the Master role." No design yet. ClickUp: **DGS-170** (list O.3: Roles,
task id `14zcebruqtk`). The Maestro role (the head butler) is DGS-176 (`backlog/define-the-maestro-role.md`).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". The roles are a household: the **Master** (the user), the **Maestro** (the head butler), the workers (the servants).

## Decided (Jack, 2026-10-04)

- **Master: represents the user.** The end user, in the role of the one who gives the orders.
- **The Master decides which projects get a maestro,** and starts and stops them. One maestro per project (DGS-172 defines "project").
- **The Master uses only a client or an Observer,** never a worker directly: a client to give orders (the Master's client, DGS-174; it was
  called the "Operator" before the roles were named), or an Observer to watch (DGS-175).
- **Candidate, not yet decided (Jack, 11:45 UTC+7 [04:45Z]): "I'm the master, so maybe whoever holds the SSH key connection to the VPS, with a
  password, is classified as Master."** The Master's identity is the holder of the SSH key (and its passphrase) that reaches the VPS. See
  "Authority" below for what this does and does not protect.
- **The other names are dropped:** Operator, Controller, Orchestrator, Grindstone, Butler (the maestro is the butler), and "Master" as the
  maestro's name.

## To define

- **Who the Master is.** A person, or an app acting for the person. Can there be more than one Master for a project, or only one at a time?
- **What the Master decides** (policy, design approvals, which projects exist, the ClickUp writes the maestro may not make) and **what it
  never has to do** (answer routine worker prompts, create a ticket for a backlog item). DGS-171 holds the detail of "what does Jack do".
- **How the Master takes over from a maestro and hands back.** One typist at a time (herdr allows one typing client per pane).
- **What the Master sees and how it is told:** what the maestro reports to the Master and when (the maestro's side is DGS-176), and the
  Master's own view, the Observer (DGS-175).
- **The Master's client.** What it needs to do (give an order, answer a question, approve or stop a step); built in DGS-174.
- **Authority (the SSH-key candidate).** Whoever can SSH in can already do anything on the VPS, so "the holder of the SSH key" is the right
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
  root-owned files (the TokenReply key, the ClickUp token, the account tokens). Ways to reduce it, cheapest first: (1) set
  `PasswordAuthentication no`, put a passphrase on the key, keep the private key out of synced folders (MEGA), use `ssh-add -t` timeouts,
  and no agent forwarding to hosts you do not trust; (2) Tailscale and close public port 22, so a stolen key is useless from outside the
  tailnet (the attacker also needs an enrolled device and your account); (3) a hardware-backed key (FIDO2, `ed25519-sk`, a touch per use):
  it cannot be copied, and a separate one can be the Master's signing key, so a stolen login key still cannot approve an escalation;
  (4) a smaller blast radius: run the maestro and workers as a non-root user and keep secrets readable only by the processes that need
  them; (5) a login alert. SSH alone is a sound boundary for reaching the Master's client; it should not be the only proof of authority for
  an escalating order.
  Earlier wording of the same question: How the Master's word reaches the maestro and workers. A peer message cannot grant escalation, and an approval inside a
  guardrail needs limits the Master writes (the approval guardrail Jack wrote, DGS-155). The Master role has to say how a Master's order is
  told apart from a worker's or another session's message.

## Questions to settle first

- **Where the Master's client runs:** a laptop terminal, the Desktop app over SSH, `opencode attach`, a web page behind an SSH tunnel.
- **How the Master starts a maestro** for a new project (DGS-172 and DGS-173: today a project is a name, a Git repository, a dedicated herdr
  session and a Desktop maestro of the same name).
- **Many Masters or one,** and how the three of us (Jack, a future colleague) would share a project.

## Output

A design in the ticket's board folder: the Master role with a definition, rights, what it never has to do, and one example, plus how a
Master order is recognised. Brainstormed with Jack. A worker may run the sessions (`digismith:brainstorming`), the maestro answers the
routine ones.

## Log of Jack's statements (kept for the record)

- 2026-10-04 11:2x: "we need another backlog item to brainstorm the new role, which must be done before this"; no kicker; Observer agreed;
  the typing role's name open (Operator, Controller, Orchestrator, Grindstone). The maestro count is decided by "the operator, what the
  client user, me, could do"; then "one maestro for a project"; "a butler to manage our project for the end user".
- 11:3x: "Forget the observer, put it into another backlog now, just focus on the master and butler."
- 11:5x: "Master: represent the user. Maestro: represent the highest rank of servant, a butler."
- 11:40: "Decouple the maestro change to another ticket. 170 fully focus on the Master role."

## Related

[define-the-maestro-role.md](define-the-maestro-role.md) (DGS-176, the head butler), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169),
[define-the-observer-role.md](define-the-observer-role.md) (DGS-175), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md)
(DGS-174), [define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md) (DGS-171),
[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md)
(DGS-146), DGS-155 (approval guardrail), DGS-156 (methodology vocabulary).
