import type { CommandModule } from "yargs";

/** Types a command's handler once for tests: yargs types it for ArgumentsCamelCase<{}>, tests call it with their own argv. */
export function handlerOf<A>(command: CommandModule<object, A> | CommandModule): (argv: A) => Promise<void> {
  return command.handler as unknown as (argv: A) => Promise<void>;
}
