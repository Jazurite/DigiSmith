---
name: flux
description: The flux (handoff and resume across sessions) rules for a maestro. Use when Jack says flux, Arise, or the session is about to be cleared.
---
# Flux (short form; full design: `.digismith/docs/E/E.4/flux-protocol/plan.md`)
- Only the maestro resumes after a flux. It reads its note, shows a summarized next-task list and ASKS Jack; it never continues alone.
- A flux = write the handoff note (see skill `handoff`), then Jack starts the new session; "Arise" wakes it.
- No state carries across tickets: a worker reports and waits; the maestro closes it.
- This pilot has no kicker: Jack types "Arise" in the attached TUI.
