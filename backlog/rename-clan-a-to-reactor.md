# Rename clan A from "System" to "Reactor"

**Status:** Decided, Jack (2026-10-10 ~21:0x UTC+7 [14:0xZ]). ClickUp: **DGS-321** (A.0: Pavilion, task id `14zcebrvcyg`). Needs DGS-320.

## Why

"A: System" is too broad: everything is a system (the Workbox, the Depot, herdr), and the word clashes with "system prompt" and "operating
system". Clan A holds the DigiSmith plugin's machinery: A.1 Primitives (the skills), A.3 Lifecycle Hooks, A.4 Configuration. It is the power
source every other clan builds on: **Reactor** (picked over Core; Oracle is kept for a future knowledge-shaped clan). Clan C stays **Platform**.

## To do

1. Rename the ClickUp folder `1301150000001868` "A: System" to "A: Reactor": with `dg clickup update-folder` (**DGS-320**, D.3, public API
   `PUT /folder/{id}`), or in the web app. Lists and tickets keep their ids.
2. Update current docs that say "A: System": `backlog/README.md`, `platform-clan.md`, `scripture-clan.md`, `monitoring-analysis-clan.md`,
   `clickup-synchronization.md`, `manager-orchestrator-profile.md`, `distribute-parked-letters.md` (current text only; history stays).
3. Update the memory notes.
