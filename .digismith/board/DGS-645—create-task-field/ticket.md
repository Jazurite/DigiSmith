# DGS-645: create-task read-back for --field values

**Key:** DGS-645

dg clickup create-task --field "Sign-off=Auto" --field "Mode=Manual" made DGS-644 with Mode = Autonomous (orderindex 0). A later update-task set Manual right. Fix: create-task reads the fields back, retries a mismatch once, exits 1 with both values if it still differs. The "default Mode in code" half is dropped (ClickUp field default, DGS-646). Full text: spec.md in this folder. (Written from spec.md; no live ClickUp read, per the order.)
