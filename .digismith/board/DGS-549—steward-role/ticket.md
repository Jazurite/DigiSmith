# Steward role: keeps the work, the Claude sessions and ClickUp in sync

**Key:** DGS-549
**Source:** ClickUp DGS-549, list B.5 Autonomous Engineering, status refinement. Brief: .digismith/sessions/dgs-549/brief.md

## Description
The Steward is the actor of epic Engineering Workflow Sync (DGS-213), initiative DGS-470. It keeps three things in step: the work (skills, conductors, workers), the Claude sessions, and ClickUp. It moves ticket status along DGS-488's flow, files and types new ideas, completes fields, and (later) audits nightly. State: one file per open ticket in ~/.digismith-depot/steward/<KEY>.json, cleared at done or discarded. Full text: `dg clickup get-task DGS-549`.

## Scope of this work
Refinement only (DGS-488): spec, plan, ranked build tickets, Definition of Ready, Sign-off mark. No build.
