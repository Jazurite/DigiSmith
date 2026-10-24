# Oculus: tokens and cost per run, burn per hour and seat windows

**Key:** DGS-590
**URL:** https://app.clickup.com/t/14zcebrwcaq
**Story Points:** TBD

## Description

Follow-up of DGS-586. The Oculus UI keeps empty slots for three numbers: tokens per run (Runs table, run page budget card), token burn per hour (top bar), and each seat's 5h and weekly window (top bar). Jack added cost in a comment: "show cost too, make it auto" (order oc-02).

- A data job every 5 min writes a per-run token snapshot next to the run record (`runs/<folder>/<run>/tokens.json`): the five token classes per model, counted with the DGS-214 counter, incremental by transcript offset.
- Cost in USD from the B.3 price table (DGS-567), per run and per model, with the price table version.
- The usage probe writes its last reading of each seat to `~/.digismith-depot/usage-probe/seats.json`.
- The view command and the UI fill the slots from these files; "-" when a file is missing or older than 15 min.

Clan G (Token Economics, G.1 Telemetry) owns the counting; this ticket is the Oculus side. Full text: `dg clickup get-task DGS-590`.

## Acceptance Criteria

- Tokens and Cost columns in the Runs table, a tokens/cost card on the run page, burn per hour (tokens and $) and seat windows in the top bar.
- "-" when a file is missing or older than 15 min. Never a false number.
- No new LaunchAgent. Counts and money only, no message text.
