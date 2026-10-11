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

  it("sends --markdown-description as markdown_description", () => {
    expect(buildTaskWriteBody({ markdownDescription: "# Title\n\n**bold**" })).toEqual({
      markdown_description: "# Title\n\n**bold**",
    });
  });

  it("reads --markdown-description-file as UTF-8", () => {
    const dir = mkdtempSync(join(tmpdir(), "dg-clickup-md-"));
    try {
      const file = join(dir, "d.md");
      writeFileSync(file, "- one — dash\n", "utf8");
      expect(buildTaskWriteBody({ markdownDescriptionFile: file })).toEqual({
        markdown_description: "- one — dash\n",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when --markdown-description-file cannot be read", () => {
    expect(() => buildTaskWriteBody({ markdownDescriptionFile: join(tmpdir(), "no-such-dir", "x.md") })).toThrow(
      /cannot read --markdown-description-file/
    );
  });

  it("refuses two description flags together", () => {
    const msg = "use only one of --description, --markdown-description, --markdown-description-file";
    expect(() => buildTaskWriteBody({ description: "a", markdownDescription: "b" })).toThrow(msg);
    expect(() => buildTaskWriteBody({ description: "a", markdownDescriptionFile: "b.md" })).toThrow(msg);
    expect(() => buildTaskWriteBody({ markdownDescription: "a", markdownDescriptionFile: "b.md" })).toThrow(msg);
  });

  describe("markdown description edge cases", () => {
    function withFile(content: string, run: (file: string) => void) {
      const dir = mkdtempSync(join(tmpdir(), "dg-clickup-md-"));
      try {
        const file = join(dir, "d.md");
        writeFileSync(file, content, "utf8");
        run(file);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it("strips a leading UTF-8 BOM from the file text", () => {
      withFile("\uFEFF# Title\n", (file) => {
        expect(buildTaskWriteBody({ markdownDescriptionFile: file })).toEqual({ markdown_description: "# Title\n" });
      });
    });

    it("keeps CRLF line endings and a BOM-looking char that is not leading", () => {
      withFile("a\r\nb\uFEFFc\r\n", (file) => {
        expect(buildTaskWriteBody({ markdownDescriptionFile: file })).toEqual({ markdown_description: "a\r\nb\uFEFFc\r\n" });
      });
    });

    it("passes JSON and shell-looking content through untouched", () => {
      const text = '{"a":"$(x)"} `rm -rf` $HOME \\n';
      expect(buildTaskWriteBody({ markdownDescription: text })).toEqual({ markdown_description: text });
      withFile(text, (file) => {
        expect(buildTaskWriteBody({ markdownDescriptionFile: file })).toEqual({ markdown_description: text });
      });
    });

    it("rejects an empty or whitespace-only --markdown-description", () => {
      expect(() => buildTaskWriteBody({ markdownDescription: "" })).toThrow(/--markdown-description needs non-empty text/);
      expect(() => buildTaskWriteBody({ markdownDescription: "  \n " })).toThrow(/--markdown-description needs non-empty text/);
    });

    it("rejects an empty, whitespace-only or BOM-only file", () => {
      for (const content of ["", " \n\t", "\uFEFF", "\uFEFF\n"]) {
        withFile(content, (file) => {
          expect(() => buildTaskWriteBody({ markdownDescriptionFile: file })).toThrow(/is empty/);
        });
      }
    });

    it("rejects a repeated flag (yargs gives an array)", () => {
      expect(() => buildTaskWriteBody({ markdownDescription: ["a", "b"] as unknown as string })).toThrow(
        "pass --markdown-description once"
      );
      expect(() => buildTaskWriteBody({ markdownDescriptionFile: ["a", "b"] as unknown as string })).toThrow(
        "pass --markdown-description-file once"
      );
    });
  });

  it("carries --parent as the parent task id", () => {
    expect(buildTaskWriteBody({ parent: "abc123" })).toEqual({ parent: "abc123" });
  });

  it("turns an empty --parent into none, which ClickUp reads as clear the parent", () => {
    expect(buildTaskWriteBody({ parent: "" })).toEqual({ parent: "none" });
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
