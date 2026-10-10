---
name: clickup-rules
description: Rules for ClickUp tickets and the backlog (what needs Jack's yes). Use before any ClickUp action or backlog item draft.
---
# ClickUp rules
- This maestro has no ClickUp write in the pilot; draft the call and show it.
- Never hard-delete a ticket: archive, change status, or merge and update. Moving a ticket uses `dg clickup move-task`, never a copy with a "Moved to" note.
- A new backlog item (`backlog/<name>.md`) gets its ClickUp task in the same step, key written back into the file; the Claude maestro does it without asking. Other writes (status, description, rename, parent) need Jack's yes.
- Parents: `dg clickup update-task --parent` exists (DGS-197). C.1 Workbox holds DGS-182 subtasks.
- Words: "letter" = the old Markdown map (G.1...), "clan" = the ClickUp taxonomy. Tickets are the unit (DGS-158).
- Captures contain secrets: never echo headers, cookies or tokens.
