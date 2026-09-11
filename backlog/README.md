# Backlog

Improvements, findings, and ideas that are worth doing but not yet
applied to any skill or doc. One file per item. Not a roadmap (see
`MEMORY.md` for that) — this is the holding pen for things noticed
along the way that shouldn't get lost, but also shouldn't get edited in
immediately without review.

Delete an item's file once it's been applied (or explicitly dropped).

## Items

- [capture-ephemeral-url: fetch PR comments via REST, not `gh pr view`](capture-ephemeral-url-rest-comment-fetch.md) — Step 4's comment fetch has two independent bugs that can silently return "not found"
- [PR creation: existing-PR check, fork-aware remotes, injection-safe args](pr-creation-fork-and-existing-check.md) — gaps found against upstream `superpowers:finishing-a-development-branch`'s bare-bones "push and create PR" option
- [Worktree creation: support arbitrary per-project setup](worktree-custom-setup-script.md) — `.env` provisioning (and similar) isn't covered by `using-git-worktrees`'s fixed package-manager install list
- [Merge-conflict detection gap in Option 1](merge-conflict-detection-gap.md) — lower confidence; no explicit guidance when `git merge` itself fails, before tests even run
- [Stale `.git/index.lock` auto-recovery](stale-index-lock-recovery.md) — an interrupted git command can silently break every future git command in a worktree until manually cleaned up; nothing currently detects or recovers from it
- [Per-worktree dev server port allocation](dev-server-port-allocation.md) — medium confidence; only matters if concurrent worktrees' dev servers are actually a thing Jack does
- [Telemetry: automatic session lifecycle](telemetry-auto-lifecycle.md) — start/stop tied to session start/close/delete instead of manual trigger; deferred until real telemetry data exists
- [`inject-standards` has no scenario for review-time dispatch](review-time-standards-injection-gap.md) — folded into the W.8-framed item below, don't brainstorm standalone
- [Activate `requesting-code-review` with standards injection (tentatively W.8)](activate-requesting-code-review-w8.md) — brainstormed 2026-09-11 up through a proposed design, then deferred; W-lineage primitive activation, not a G.1-first change
- [Multi-repo distribution (I.2)](jira-write-back-adf-reporting.md) — profile-gated worktree fan-out across market repos, learned from EMKT-784; I.1 (real ADF formatting) shipped 2026-08-26
- [Technical writing / content-voice skill (new letter, tentatively T)](technical-writing-content-voice.md) — I.1's first progress-comment draft leaked git/PR mechanics at a PO/PM audience; no map letter reserved yet
- [Ticket description Track-section template (Deliverable / Per Market)](track-section-template.md) — live-tested on EMKT-756, tension with `I.1`'s current single-checkmark Step 7 noted; natural output for I.2
- [Opinionated default tech stack (designed as map item G.2, Toolchain)](opinionated-tech-stack-defaults.md) — source narrative for G.2; design shipped 2026-09-11, see `.digismith/docs/toolchain/design.html`
- [Toolchain defaults: trigger scope beyond brainstorming](toolchain-general-trigger-scope.md) — deferred out of G.2's initial design; brainstorming-only for now, per Jack's own scope call
- [First non-fast-forward merge — re-examine report-implementation's assumption](non-fast-forward-merge-first-occurrence.md) — happened for real merging K.2; didn't break anything since the report is written pre-merge, but the original design note asked to be revisited when this occurred
- [AI Gateway Vendors (K.3)](ai-gateway-vendors-k3.md) — pluggable gateway choice beyond Chutes, live-tested via TokenReply + Claude Agent SDK; core item for the four below
- [Mechanical/task-tier offload blocked by Claude Code's auto-mode permission classifier (K)](offload-blocked-by-permission-classifier-k.md) — confirmed live twice, both runners; likely session-specific, not a DigiSmith bug
- [Review templates don't guard against AI attribution in commits](review-templates-dont-guard-ai-attribution.md) — an implementer added a `Co-Authored-By: Claude` trailer despite explicit instructions; the reviewer assumed it was expected instead of flagging it
- [Run multiple gateways in parallel (K.5)](gateway-parallel-execution-k5.md) — depends on K.3
- [Harness benchmark: Claude Code vs. OpenCode (K.6)](harness-benchmark-claude-code-vs-opencode-k6.md) — independent axis, shares K.3's spike evidence
- [Vendor benchmark: Chutes vs. TokenReply vs. future gateways (K.7)](gateway-vendor-benchmark-k7.md) — depends on K.3
- [offload-implementer: timeout floor too low, undocumented progress-read options](offload-implementer-timeout-and-progress-read.md) — found live during V.1's smoke test, out of that task's scope
- [DigiSmith self-development can't test its own not-yet-merged Skill-tool calls](plugin-cache-lag-self-development.md) — structural gap, will recur for any future cross-skill integration built before merge
- [`check_vendored_skills.ts` hardening (map item W.2)](check-vendored-skills-hardening.md) — 8 deferred minors from its final review; none reachable today
- [Persistent concurrent worker pool for offload dispatch (K.8)](persistent-worker-pool-k8.md) — bigger than K.5, depends on K.2/K.3/K.6/V.1; captured as an idea, not yet brainstormed
- [Persistent VPS-hosted Claude Code session via SSH (folding into V.3)](vps-session-hosting-x.md) — in design 2026-09-11; hosting the main session itself, not offload workers; Remote Control and self-hosted environments both ruled out as alternatives
- [Practice-grade dev/prod infrastructure: relocate Agentic Bridge to the VPS (new letter, tentatively X)](practice-devprod-infra-x.md) — explicitly a skill-building goal, not a DigiSmith functional need; split out of the V.3 brainstorm; real auth is a hard requirement regardless of motivation
- [Native multi-provider model router (new letter, tentatively Z)](native-model-router-z.md) — promoted out of K-lineage (was K.9) once scope grew into modifying `subagent-driven-development` itself (W's territory) plus a small reference-research library; distinct from K.5 (comparison), K.7 (benchmark), K.8 (concurrency)
- [Cross-repo hook sharing (new letter, tentatively Y2)](cross-repo-hook-sharing-y2.md) — explicitly scoped out of **Y** (lifecycle hooks) rather than folded into it; deferred, no design yet
- [TokenReply's kimi-k3 fails tool-calling via claude-code runner (regression)](tokenreply-kimi-k3-tool-calling-failure.md) — confirmed live: dispatch silently did nothing while reporting success; affects the current shipped default (tokenreply/claude-code/kimi-k3), unfixed
- [Dormant vendored skills' internal `superpowers:` cross-references](dormant-skills-superpowers-cross-references.md) — 18 references across 7 files will break once Superpowers is no longer installed locally
- [TokenReply's gpt-5.6-luna also fails tool-calling via claude-code runner](tokenreply-gpt-5-6-luna-tool-calling-failure.md) — confirmed live, 2 trials, 2 different failure signatures (silent fake-success once, honest BLOCKED once); distinct bug from the kimi-k3 one, no known working fallback in the same model family yet
- [Reconsider TokenReply's "task" role default model (kimi-k2.7 vs. kimi-k3)](tokenreply-task-role-default-model-k.md) — raised live during Z.1's execution, deliberately deferred as K-lineage territory rather than answered on the spot
- [Post-finish hooks assume the Option-1 merge flow — direct-to-main push leaves them stranded (Y)](post-finish-hooks-direct-push-gap.md) — gap in Y.1's shipped hooks; `ORIG_HEAD` stale/misleading when invoked by hand outside a real merge; distinct from `no-push-after-local-merge`
- [`subagent-driven-development`'s mechanical-tier offload prerequisite check needs a real check, not a shell env-var echo](mechanical-tier-offload-prereq-check-shallow.md) — a bare `echo $TOKENREPLY_API_KEY` missed the real file-fallback credential, wrongly triggering a Claude-only fallback for all of H.1's tasks
- [Standardized session handoff document format](standard-handoff-format.md) — 4 differently-structured handoffs from one short window; Jack noted one session's didn't match another's and should have
- [Token counter (K.4) has no producer of real TokenUsage yet](token-counter-usage-producer-gap.md) — found during K.4's final review; no runner parses real token counts from its own event stream, so `computeTokenCost` is only reachable by hand-assembling usage today
