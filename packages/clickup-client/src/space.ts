import type { ClickUpClient } from "./client.ts";
import type { ClickUpFolder, ClickUpListSummary } from "./types.ts";

/** Binds a client to one space id, so callers stop threading spaceId through every call. */
export class Space {
  constructor(
    private readonly client: ClickUpClient,
    readonly id: string
  ) {}

  createFolder(name: string): Promise<ClickUpFolder> {
    return this.client.createFolder(this.id, name);
  }

  createList(name: string): Promise<ClickUpListSummary> {
    return this.client.createListInSpace(this.id, name);
  }
}
