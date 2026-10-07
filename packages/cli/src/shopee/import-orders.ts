import * as fs from "node:fs";
import type { CommandModule } from "yargs";
import { joinOrders } from "./join.ts";
import { formatCsv, formatJson, formatTable } from "./format.ts";

function readStdin(): string {
  return fs.readFileSync(0, "utf-8");
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
          describe: "a file with the pasted text, or - to read stdin (pbpaste | dg shopee import-orders -)",
        })
        .option("json", { type: "boolean", describe: "print JSON (ISO times)" })
        .option("csv", { type: "boolean", describe: "print CSV, one row per line item" })
        .conflicts("json", "csv")
        .epilog(
          "Input is Proxyman 'copy' text: blocks starting with '[n] URL = ...'. Only the URL line and the response " +
            "JSON are read; the Request section is ignored. Purchase date is the detail's create_time. " +
            "Shopee sends money x100000; amounts are converted to VND. Shipping and payment data are never printed. " +
            "Orders with no captured detail show MISSING and are counted."
        ),
    handler: (argv) => {
      const input = argv.input as string;
      try {
        let text: string;
        // yargs turns a lone "-" into "", so both mean stdin.
        if (input === "-" || input === "") {
          text = stdinReader();
        } else {
          try {
            text = fs.readFileSync(input, "utf-8");
          } catch {
            throw new Error(`cannot read file ${input}`);
          }
        }
        if (!text.trim()) throw new Error("input is empty");
        const result = joinOrders(text);
        for (const e of result.errors) console.error(`shopee import-orders: ${e}`);
        if (!result.hasList) throw new Error("no order list found in the input");
        const skipped = result.errors.length;
        if (argv.json) console.log(formatJson(result.orders, result.missing, skipped));
        else if (argv.csv) console.log(formatCsv(result.orders));
        else console.log(formatTable(result.orders, result.missing, skipped));
        process.exitCode = 0;
      } catch (err) {
        console.error(`shopee import-orders: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const importOrdersCommand: CommandModule = createImportOrdersCommand();
