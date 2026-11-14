# Factory reads both ClickUp spaces: DigiSmith (DGS) and Oculus (OCL keys)

**Key:** OCL-105
**Task id:** 14zcebrypxm
**Space:** Oculus 1301150000003197 (list Product > Backlog)
**Status:** refinement

## Problem
On 2026-11-14 about 80 Oculus tickets (the Nexus clan J and most of B.6 Factory, B.7 Scheduling) moved from the DigiSmith space to the Oculus space. They now have OCL keys. The autonomous scan, Steward and Director read only the DigiSmith space (`DIGISMITH_SPACE_ID`) and DGS keys, so a moved ticket set to `to do` is never claimed.

## Goal
The scan, Steward and Director read both spaces: DigiSmith (DGS) and Oculus (OCL, space 1301150000003197). A ticket key resolves to its space by prefix. Board folders, branch names and plans accept OCL keys.

## Done when
A test ticket in the Oculus space set to `to do` with Mode Autonomous is claimed by the scan, built, and its status moves are written back in the Oculus space.

## Added scope (Dock order dock-04)
The Oculus space has no `Mode` and `Sign-off` custom fields. The spec says how they get there through `dg`, same options as DigiSmith's.

Context: extracting the engine code into the Oculus repo is a separate, larger ticket.
