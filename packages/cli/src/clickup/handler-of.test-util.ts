import type { CommandModule } from "yargs";

/** Types a command's handler once for tests: yargs types it for ArgumentsCamelCase<{}>, tests call it with their own argv. */
/** A is the test's own assertion about the argv it passes; it is not inferred from the command. */
export function handlerOf<A>(command: CommandModule<object, A> | CommandModule): (argv: A) => Promise<void> {
  return command.handler as unknown as (argv: A) => Promise<void>;
}
