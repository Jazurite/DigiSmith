# A Master can only drive its own maestro (ownership registry and a guard on herdr prompts)

**Status:** Idea, Jack (2026-10-10 ~18:1x UTC+7 [11:1xZ]). ClickUp: **DGS-272** (C.1: Workbox, task id `14zcebrvcuz`). No design yet.

## The problem

Several Masters (Desktop sessions) share one herdr session `default` and its maestros. Nothing stops a Master from typing into another
Master's maestro.
- **2026-10-10 ~17:48 UTC+7:** this Master (Desktop session "DigiSmith", owner of `digismith-maestro`) sent the DGS-266 order straight to
  `d3-maestro`, which belongs to Jack's other Desktop session, because DGS-266 sits in D.3. `d3-maestro` dispatched worker `dgs-266` at once.
  Jack left it with that session.
- **Earlier the same day,** the other Master used `digismith-maestro` while it was busy with this Master's DGS-169 work, which broke a measurement.

Today only memory notes prevent it ("route by Master, never by clan").

## Jack's rule

The Master works on any ticket Jack names, **through its own maestro**, whatever the clan. Maestros belong to Masters, not to clans.

## To build

1. **Ownership registry:** for example `.digismith/sessions/<maestro>/owner`, naming the Master session (title or id) that drives it.
2. **A guard for Masters**, as `herdr-ws` is for maestros: a Master may run `agent prompt`, `pane run`, `send-keys` and `tab close` only on
   its own maestro and that maestro's workers; reading other panes stays allowed.
3. **A clear refusal** that names the owner ("d3-maestro belongs to <session>; ask Jack").
4. **Workers record who dispatched them** (maestro and Master), so ownership follows the chain.

## Related

DGS-198 (one herdr session, `herdr-ws`), DGS-155 (maestro approval inside a guardrail), DGS-203 (the Representative), DGS-171 (roles).
