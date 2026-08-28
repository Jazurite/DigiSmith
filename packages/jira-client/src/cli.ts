import { readFileSync } from "node:fs";
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getAttachmentContent,
} from "./client.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
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
        const creds = checkCredentials();
        const fields = args.fields.split(",");
        const result = await getIssue(args.key, fields, creds);
        console.log(JSON.stringify(result));
        break;
      }
      case "update-description": {
        const creds = checkCredentials();
        const adfDoc = JSON.parse(readFileSync(args.file, "utf-8"));
        await updateDescription(args.key, adfDoc, creds);
        console.error("update-description: ok");
        break;
      }
      case "add-comment": {
        const creds = checkCredentials();
        const adfDoc = JSON.parse(readFileSync(args.file, "utf-8"));
        const result = await addComment(args.key, adfDoc, creds, args["comment-id"]);
        console.log(JSON.stringify(result));
        break;
      }
      case "get-attachment": {
        const creds = checkCredentials();
        const savedPath = await getAttachmentContent(args.id, args.out, creds);
        console.log(savedPath);
        break;
      }
      default:
        console.error(`unknown subcommand: ${subcommand}`);
        process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof CredentialsError) {
      console.error(`no credentials: ${err.message}`);
    } else {
      console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

main();
