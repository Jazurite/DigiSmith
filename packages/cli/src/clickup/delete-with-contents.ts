import { ClickUpApiError } from "@digismith/clickup-client";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

/** Counts a list's tasks, archived and closed included (archived=true returns ONLY archived ones, so merge by id). */
async function countTasks(client: ClickUpClient, listId: string): Promise<number> {
  const base = { include_closed: true, subtasks: true };
  const live = await client.getListTasks(listId, { params: { ...base, archived: false } });
  const archived = await client.getListTasks(listId, { params: { ...base, archived: true } });
  return new Set([...live, ...archived].map((t) => t.id)).size;
}

/** A read that says the target is gone: 404, or a 401/403 answer about a deleted object. Anything else is not proof. */
function isGone(err: unknown): boolean {
  return err instanceof ClickUpApiError && err.status === 404;
}

async function readBack(read: () => Promise<unknown>, kind: string, id: string): Promise<void> {
  try {
    await read();
    console.log(`read back: ${kind} ${id} is STILL readable (ClickUp may finish the delete in the background; read again in a minute)`);
    process.exitCode = 1;
  } catch (err) {
    if (isGone(err)) console.log(`read back: ${kind} ${id} is gone (404)`);
    else console.log(`read back: ${kind} ${id} could not be read (${(err as Error).message}); check it with dg clickup get-lists`);
  }
}

export interface WithContentsArgs {
  id: string;
  yes: boolean;
  reader: () => ClickUpClient;
  frontdoor: () => FrontdoorClient;
}

/** The ids are read as one number each: a space id, a list id given as a folder, or junk fails the public read and is refused. */
export async function deleteFolderWithContents({ id, yes, reader, frontdoor }: WithContentsArgs): Promise<void> {
  if (!ID.test(id)) throw new Error("--folder must be a folder id (digits only)");
  const client = reader();
  let folder: { id: string; name: string };
  try {
    folder = await client.getFolder(id);
  } catch (err) {
    throw new Error(`${id} is not a readable folder id (a space or list id is refused): ${(err as Error).message}`);
  }
  const lists = await client.getFolderLists(id);
  console.log(`folder ${id}  ${folder.name}`);
  let total = 0;
  for (const l of lists) {
    const n = await countTasks(client, l.id);
    total += n;
    console.log(`  list ${l.id}  ${l.name}  (${n} task${n === 1 ? "" : "s"})`);
  }
  console.log(`${lists.length} list(s), ${total} task(s); nested folders inside it go too and are not counted here`);
  if (!yes) {
    printCall("DELETE", `/hierarchy/v1/category/${id}`, undefined);
    console.log("would delete the folder WITH everything in it");
    console.log("nothing sent; add --yes to send");
    return;
  }
  await frontdoor().deleteFolderWithContents(id);
  console.log(`deleted folder ${id} with its contents`);
  await readBack(() => client.getFolder(id), "folder", id);
}

export async function deleteListWithContents({ id, yes, reader, frontdoor }: WithContentsArgs): Promise<void> {
  if (!ID.test(id)) throw new Error("--list must be a list id (digits only)");
  const client = reader();
  let list: { id: string; name: string };
  try {
    list = await client.getList(id);
  } catch (err) {
    throw new Error(`${id} is not a readable list id (a space or folder id is refused): ${(err as Error).message}`);
  }
  const n = await countTasks(client, id);
  console.log(`list ${id}  ${list.name}  (${n} task${n === 1 ? "" : "s"}, archived and closed included)`);
  if (!yes) {
    printCall("DELETE", `/hierarchy/v1/subcategory/${id}`, undefined);
    console.log("would delete the list WITH its tasks");
    console.log("nothing sent; add --yes to send");
    return;
  }
  await frontdoor().deleteListWithContents(id);
  console.log(`deleted list ${id} with its tasks`);
  await readBack(() => client.getList(id), "list", id);
}
