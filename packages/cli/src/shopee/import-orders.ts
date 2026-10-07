import * as fs from "node:fs";
import type { CommandModule } from "yargs";
import { joinBlocks, joinOrders } from "./join.ts";
import { readFolder } from "./folder.ts";
import { formatCsv, formatJson, formatTable } from "./format.ts";

function readStdin(): string {
  return fs.readFileSync(0, "utf-8");
}

export function parseSkipFile(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
}

export function collectSkipIds(skip: unknown, fileText: string | null): string[] {
  const fromFlag = (Array.isArray(skip) ? skip : skip === undefined ? [] : [skip])
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set([...fromFlag, ...(fileText === null ? [] : parseSkipFile(fileText))])];
}

export function createImportOrdersCommand(stdinReader: () => string = readStdin): CommandModule {
  return {
    command: "import-orders <input>",
    describe: "list your Shopee VN purchases from pasted Proxyman text (no live call to Shopee)",
    builder: (y) =>
      y
        .positional("input", {
          type: "string",
          demandOption: true,
          describe: "a Proxyman Raw export folder, a file with the pasted text, or - to read stdin (pbpaste | dg shopee import-orders -)",
        })
        .option("json", { type: "boolean", describe: "print JSON (ISO times)" })
        .option("csv", { type: "boolean", describe: "print CSV, one row per line item" })
        .option("skip", {
          type: "string",
          array: true,
          describe: "order id(s) to leave out, comma separated, repeatable",
        })
        .option("only-dated", {
          type: "boolean",
          describe: "leave out orders with no purchase date (no captured detail) and count them",
        })
        .option("skip-file", { type: "string", describe: "file with one order id per line to leave out (# comments ignored)" })
        .conflicts("json", "csv")
        .epilog(
          "Input is Proxyman 'copy' text (blocks starting with '[n] URL = ...') or a Proxyman Raw export folder. " +
            "Only the URL (request line 1 in a folder) and the response JSON body are read; everything else in a request is ignored. Purchase date is the detail's create_time. " +
            "Shopee sends money x100000; amounts are converted to VND. Shipping and payment data are never printed. " +
            "Orders with no captured detail show MISSING and are counted. A bundle is one row at the bundle price. Rows have no currency in the list, so the currency defaults to VND (Shopee VN). Cancelled orders (status label_order_cancelled, or a header text with cancel and refund) are skipped automatically and counted. Orders the list shows as completed but are cancelled or refunded in real life can be left out by hand with --skip <id[,id...]> (repeatable) or --skip-file <path> (one id per line, # comments ignored); they are counted as 'skipped by --skip', and an id not in the data only prints a note. --only-dated leaves out every order with no purchase date (no captured detail) and counts them as 'skipped undated'; it combines with the skip options and the cancelled rule. Without it, undated orders show as MISSING. Refund lines are skipped and counted: a line with a negative price, text containing refund / hoan tien / return, or listed in an order-level refund list."
        ),
    handler: (argv) => {
      const input = argv.input as string;
      try {
        let skipText: string | null = null;
        const skipFile = argv["skip-file"] as string | undefined;
        if (skipFile) {
          try {
            skipText = fs.readFileSync(skipFile, "utf-8");
          } catch {
            throw new Error(`cannot read skip file ${skipFile}`);
          }
        }
        const onlyDated = argv["only-dated"] === true;
        const skipIds = collectSkipIds(argv.skip, skipText);
        let result;
        const isDir = input !== "-" && input !== "" && fs.existsSync(input) && fs.statSync(input).isDirectory();
        let text = "";
        // yargs turns a lone "-" into "", so both mean stdin.
        if (isDir) {
          result = joinBlocks(readFolder(input), skipIds, onlyDated);
        } else if (input === "-" || input === "") {
          text = stdinReader();
        } else {
          try {
            text = fs.readFileSync(input, "utf-8");
          } catch {
            throw new Error(`cannot read file ${input}`);
          }
        }
        if (!result) {
          if (!text.trim()) throw new Error("input is empty");
          result = joinOrders(text, skipIds, onlyDated);
        }
        for (const e of result.errors) console.error(`shopee import-orders: ${e}`);
        for (const id of result.unknownSkipIds) console.error(`shopee import-orders: note: --skip id ${id} is not in the data`);
        if (result.orders.length === 0 && result.skippedCancelled + result.skippedByUser + result.skippedUndated === 0) throw new Error("no orders found in the input");
        if (argv.json) console.log(formatJson(result.orders, result));
        else if (argv.csv) console.log(formatCsv(result.orders));
        else console.log(formatTable(result.orders, result));
        process.exitCode = 0;
      } catch (err) {
        console.error(`shopee import-orders: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const importOrdersCommand: CommandModule = createImportOrdersCommand();
