import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClickUpClient, Space } from "@digismith/clickup-client";
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody, createDigiSmithSpace, DIGISMITH_SPACE_ID } from "./lib.ts";

describe("createClient", () => {
  it("builds a ClickUpClient from a valid credentials file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");

    const client = createClient(envPath);

    expect(client).toBeInstanceOf(ClickUpClient);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("propagates CredentialsError when the file is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-missing-"));
    const envPath = join(tmpDir, "missing.env");

    expect(() => createClient(envPath)).toThrow();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("buildTaskWriteBody", () => {
  it("maps every provided field, converting dates to epoch ms", () => {
    const body = buildTaskWriteBody({
      name: "V.1 — OpenCode server management",
      description: "Extends Depot to also manage a second machine-wide resource.",
      status: "done",
      startDate: "2026-08-20",
      dueDate: "2026-08-28",
      priority: 3,
    });

    const expected: ClickUpTaskWriteBody = {
      name: "V.1 — OpenCode server management",
      description: "Extends Depot to also manage a second machine-wide resource.",
      status: "done",
      start_date: new Date("2026-08-20").getTime(),
      due_date: new Date("2026-08-28").getTime(),
      priority: 3,
    };
    expect(body).toEqual(expected);
  });

  it("omits fields that weren't provided", () => {
    const body = buildTaskWriteBody({ name: "Just a name" });

    expect(body).toEqual({ name: "Just a name" });
  });

  it("returns an empty body when nothing was provided", () => {
    expect(buildTaskWriteBody({})).toEqual({});
  });

  it("throws when startDate is not a valid date", () => {
    expect(() => buildTaskWriteBody({ startDate: "28/08/2026" })).toThrow(
      /invalid --start-date "28\/08\/2026"/
    );
  });

  it("throws when dueDate is not a valid date", () => {
    expect(() => buildTaskWriteBody({ dueDate: "28/08/2026" })).toThrow(
      /invalid --due-date "28\/08\/2026"/
    );
  });

  it("throws when priority is not an integer", () => {
    expect(() => buildTaskWriteBody({ priority: Number.NaN })).toThrow(
      /invalid --priority "NaN" — expected an integer 1-4/
    );
  });
});

describe("createDigiSmithSpace", () => {
  it("binds the DigiSmith space id to the given client", async () => {
    const createFolder = vi.fn().mockResolvedValue({ id: "f1", name: "x" });
    const fakeClient = { createFolder } as unknown as ClickUpClient;

    const space = createDigiSmithSpace(fakeClient);

    expect(space).toBeInstanceOf(Space);
    expect(space.id).toBe(DIGISMITH_SPACE_ID);

    await space.createFolder("x");

    expect(createFolder).toHaveBeenCalledWith(DIGISMITH_SPACE_ID, "x");
  });
});
