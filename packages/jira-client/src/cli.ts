import { readFileSync } from "node:fs";
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getComments,
  getAttachmentContent,
} from "./client.ts";

export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

export function requireArgs(args: Record<string, string>, names: string[]): void {
  const missing = names.filter((name) => args[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing required flag${missing.length > 1 ? "s" : ""}: ${missing.map((n) => `--${n}`).join(", ")}`);
  }
}

function readAdfFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8").replace(/^\uFEFF/, ""));
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  try {
    switch (subcommand) {
      case "check-credentials": {
        checkCredentials();
        console.error("check-credentials: ok");
        break;
      }
      case "get-issue": {
        requireArgs(args, ["key", "fields"]);
        const creds = checkCredentials();
        const fields = args.fields.split(",");
        const result = await getIssue(args.key, fields, creds);
        console.log(JSON.stringify(result));
        break;
      }
      case "get-comments": {
        requireArgs(args, ["key"]);
        const creds = checkCredentials();
        const result = await getComments(args.key, creds);
        console.log(JSON.stringify(result));
        break;
      }
      case "update-description": {
        requireArgs(args, ["key", "file"]);
        const creds = checkCredentials();
        const adfDoc = readAdfFile(args.file);
        await updateDescription(args.key, adfDoc, creds);
        console.error("update-description: ok");
        break;
      }
      case "add-comment": {
        requireArgs(args, ["key", "file"]);
        const creds = checkCredentials();
        const adfDoc = readAdfFile(args.file);
        const result = await addComment(args.key, adfDoc, creds, args["comment-id"]);
        console.log(JSON.stringify(result));
        break;
      }
      case "get-attachment": {
        requireArgs(args, ["id", "out"]);
        const creds = checkCredentials();
        const savedPath = await getAttachmentContent(args.id, args.out, creds);
        console.log(savedPath);
        break;
      }
      default:
        console.error(`unknown subcommand: ${subcommand}`);
        process.exitCode = 1;
        return;
    }
    process.exitCode = 0;
  } catch (err) {
    if (err instanceof CredentialsError) {
      console.error(`no credentials: ${err.message}`);
    } else {
      console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
