import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
import { findByFolder, formatIdentity, listIdentities, nowStamp, readIdentity, writeIdentity } from "./identity.ts";

const USAGE = `identity-cli <command>
  write --id <id> --name <name> --owner <o> --project <p> --folder <abs path> --conductors <a,b>
        [--machine <m>] [--state <path>]    validate, then write ~/.digismith-depot/identities/<id>.yml (never overwrites)
  list                                      one line per record
  show <id>                                 print a record
  resolve --cwd <dir>                       which record names the main checkout of <dir>`;

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env, out: (s: string) => void = console.log): number {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "write": {
        const a = parseArgs(rest);
        requireArgs(a, ["id", "name", "owner", "project", "folder", "conductors"]);
        const file = writeIdentity({
          id: a.id, name: a.name, owner: a.owner, project: a.project, folder: a.folder,
          conductors: a.conductors.split(",").map((x) => x.trim()).filter((x) => x !== ""),
          role: "maestro", machine: a.machine ?? os.hostname().split(".")[0],
          state: a.state ?? path.join(a.folder, ".digismith", "sessions", a.project, "note.md"),
          created: nowStamp(),
        }, env);
        out(`wrote ${file}`);
        return 0;
      }
      case "list":
        for (const i of listIdentities(env)) out(`${i.id}\t${i.name}\t${i.project}\t${i.folder}\t${i.conductors.join(",")}`);
        return 0;
      case "show": {
        const i = rest[0] ? readIdentity(rest[0], env) : undefined;
        if (!i) { console.error("no such identity record"); return 1; }
        out(formatIdentity(i).trimEnd());
        return 0;
      }
      case "resolve": {
        const a = parseArgs(rest);
        requireArgs(a, ["cwd"]);
        const r = findByFolder(resolveMainRoot(a.cwd), env);
        if (r.ambiguous) { console.error(`ambiguous: ${r.ambiguous.join(", ")}`); return 2; }
        if (!r.found) { console.error("no identity record names this folder"); return 1; }
        out(r.found.id);
        return 0;
      }
      default:
        console.error(USAGE);
        return 1;
    }
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) process.exitCode = run(process.argv.slice(2));
