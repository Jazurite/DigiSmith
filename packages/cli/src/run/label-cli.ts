// Detached labeller entry (DGS-598): node label-cli.ts <run-dir>. Started by the SessionStart hook; always exits 0, prints nothing.
import { labelRun } from "./label.ts";

const dir = process.argv[2];
if (dir) labelRun(dir, process.env);
process.exitCode = 0;
