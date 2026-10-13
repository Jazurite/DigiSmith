import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CardError, closeCard, findCard, findCardBySession, formatCard, listCards, markLost, nowIso,
  parseCard, touchCard, validateCard, writeCard, type CardRef,
} from "./session-card.ts";

const USAGE = `session-card-cli [--depot <dir>] <command>
  validate <file>                      check a card file; exit 1 with the errors
  write <file>                         validate, then write it into the depot (cards/)
  new --field k=v ... [--dry]          build a card from fields (started, last_seen, status default), validate, write
  read <project> <id> <session>        print a card (open, else archived)
  find <session> [project]             print the path of the open card of a session
  list <project> [--scope open|archive|all]
  touch|close|lost <project> <id> <session> [--result <text>]`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function run(argv: string[]): number {
  const args = [...argv];
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (v === undefined) fail(`${flag} needs a value`);
    args.splice(i, 2);
    return v;
  };
  const takeAll = (flag: string): string[] => {
    const out: string[] = [];
    for (let v = take(flag); v !== undefined; v = take(flag)) out.push(v);
    return out;
  };
  const depot = take("--depot");
  if (depot !== undefined) process.env.DIGISMITH_DEPOT_DIR = depot;
  const scope = take("--scope") as "open" | "archive" | "all" | undefined;
  const result = take("--result");
  const fields = takeAll("--field");
  const dry = args.includes("--dry");
  if (dry) args.splice(args.indexOf("--dry"), 1);
  const [cmd, ...rest] = args;

  try {
    switch (cmd) {
      case "validate": {
        if (!rest[0]) fail(USAGE);
        parseCard(fs.readFileSync(rest[0], "utf-8"));
        console.log("ok");
        return 0;
      }
      case "write": {
        if (!rest[0]) fail(USAGE);
        console.log(writeCard(parseCard(fs.readFileSync(rest[0], "utf-8"))));
        return 0;
      }
      case "new": {
        const input: Record<string, string> = { status: "open", started: nowIso(), last_seen: nowIso() };
        for (const f of fields) {
          const i = f.indexOf("=");
          if (i < 1) fail(`--field wants key=value, got a field without "="`);
          input[f.slice(0, i)] = f.slice(i + 1);
        }
        const r = validateCard(input);
        if (!r.ok) {
          console.error(r.errors.join("\n"));
          return 1;
        }
        if (dry) process.stdout.write(formatCard(r.card));
        else console.log(writeCard(r.card));
        return 0;
      }
      case "read": {
        const found = findCard(refOf(rest));
        if (!found) fail("no such card");
        process.stdout.write(formatCard(found.card));
        return 0;
      }
      case "find": {
        const found = findCardBySession(rest[0] ?? fail(USAGE), rest[1]);
        if (!found) fail("no open card for that session");
        console.log(found.path);
        return 0;
      }
      case "list": {
        for (const { card } of listCards(rest[0] ?? fail(USAGE), { scope })) {
          console.log(`${card.status}\t${card.role}\t${card.id}\t${card.session}\t${card.last_seen}`);
        }
        return 0;
      }
      case "touch":
        touchCard(refOf(rest));
        return 0;
      case "close":
        console.log(closeCard(refOf(rest), { result }));
        return 0;
      case "lost":
        console.log(markLost(refOf(rest), { result }));
        return 0;
      default:
        console.error(USAGE);
        return 1;
    }
  } catch (e) {
    console.error(e instanceof CardError ? e.errors.join("\n") : (e as Error).message);
    return 1;
  }
}

function refOf(rest: string[]): CardRef {
  const [project, id, session] = rest;
  if (!project || !id || !session) fail(USAGE);
  return { project, id, session };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
