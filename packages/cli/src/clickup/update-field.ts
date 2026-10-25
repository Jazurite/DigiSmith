import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorFieldDefault } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";
import {
  buildFieldPutBody,
  checkDefaultNotRemoved,
  checkRemoveConfirmed,
  defaultAfterRenames,
  describeFieldDiff,
  resolveDefault,
  resolveOptionAdds,
  resolveOptionRemoves,
  resolveOptionRenames,
} from "./field-write.ts";

export function createUpdateFieldCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "update-field",
    describe: "rename a dropdown custom field, rename, add and remove its options (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("field", { type: "string", requiresArg: true, demandOption: true, describe: "custom field id (uuid)" })
        .option("name", { type: "string", requiresArg: true, describe: "new field name" })
        .option("option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'rename an option: "<current name or id>=<new name>" (split at the last =); repeat for more',
        })
        .option("add-option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: "add an option with this name (at the end); repeat for more",
        })
        .option("remove-option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: "remove an option (a delete): current name or id; repeat for more. With --yes, also needs --confirm-remove",
        })
        .option("confirm-remove", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: "the exact name of each option removed with --yes",
        })
        .option("color", { type: "string", requiresArg: true, describe: 'color of the added options, "#rrggbb" (default #cecece)' })
        .option("default", { type: "string", requiresArg: true, describe: "set the default option: current name or id" })
        .option("clear-default", { type: "boolean", describe: "remove the default option" })
        .conflicts("default", "clear-default")
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const name = argv.name as string | undefined;
        const optionArgs = (argv.option as string[] | undefined) ?? [];
        const addArgs = (argv.addOption as string[] | undefined) ?? [];
        const removeArgs = (argv.removeOption as string[] | undefined) ?? [];
        if (argv.default !== undefined && argv.clearDefault) throw new Error("--default and --clear-default exclude each other");
        if (
          name === undefined &&
          optionArgs.length === 0 &&
          addArgs.length === 0 &&
          removeArgs.length === 0 &&
          argv.default === undefined &&
          !argv.clearDefault
        ) {
          throw new Error("nothing to change: pass --name, --option, --add-option, --remove-option, --default or --clear-default");
        }
        if (name !== undefined && name.trim() === "") throw new Error("--name must not be empty");
        const client = clientFactory();
        const field = await client.getField(argv.field as string);
        if (field.type !== "drop_down") {
          throw new Error(`field "${field.name}" is ${field.type}; only drop_down fields are supported`);
        }
        let wanted: FrontdoorFieldDefault | null | undefined = argv.clearDefault
          ? null
          : argv.default !== undefined
            ? resolveDefault(field, argv.default as string)
            : undefined;
        const renames = resolveOptionRenames(field, optionArgs);
        const adds = resolveOptionAdds(field, addArgs, argv.color as string | undefined);
        const removes = resolveOptionRemoves(field, renames, removeArgs);
        const current = field.default_value ?? null;
        if (wanted !== undefined && (wanted?.value ?? null) === (current?.value ?? null)) {
          const otherChange = name !== undefined || renames.length > 0 || adds.length > 0 || removes.length > 0;
          if (!otherChange) {
            console.log(current ? `default already ${current.value}` : "default already none");
            process.exitCode = 0;
            return;
          }
          wanted = undefined;
        }
        checkDefaultNotRemoved(field, removes, wanted);
        const effective = wanted !== undefined ? wanted : defaultAfterRenames(field, renames);
        if (argv.yes) checkRemoveConfirmed(removes, (argv.confirmRemove as string[] | undefined) ?? []);
        const body = buildFieldPutBody(field, name?.trim(), renames, adds, removes, effective);
        // a read, so it is safe in a dry run: how many tickets hold each option about to go
        const warnings: string[] = [];
        for (const o of removes) {
          try {
            const n = await client.getFieldValueCount(field.id, o.id);
            warnings.push(
              n > 0
                ? `  WARNING: ${n} ticket(s) hold ${JSON.stringify(o.name)}; removing it changes their value (what ClickUp does to values is not captured)`
                : `  no ticket holds ${JSON.stringify(o.name)}`
            );
          } catch (err) {
            // a dry run still shows the plan; --yes fails closed, nothing is sent
            if (argv.yes) throw err;
            warnings.push(`  WARNING: could not count tickets for ${JSON.stringify(o.name)}: ${(err as Error).message}`);
          }
        }
        if (!argv.yes) {
          for (const line of describeFieldDiff(field, name?.trim(), renames, adds, removes, effective)) console.log(line);
          for (const line of warnings) console.log(line);
          printCall("PUT", `/customFields/v2/field/${field.id}`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          for (const line of warnings) console.log(line);
          const updated = await client.updateField(field.id, body);
          if ((effective?.value ?? null) !== (current?.value ?? null)) {
            const after = (await client.getField(field.id)).default_value ?? null;
            if ((after?.value ?? null) !== (effective?.value ?? null)) {
              console.error(
                `clickup update-field: the default did not stick: sent ${effective ? JSON.stringify(effective.value) : "none"}, ClickUp now has ${after ? JSON.stringify(after.value) : "none"}`
              );
              process.exitCode = 1;
              return;
            }
          }
          console.log(JSON.stringify(updated, null, 2));
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-field: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateFieldCommand: CommandModule = createUpdateFieldCommand();
