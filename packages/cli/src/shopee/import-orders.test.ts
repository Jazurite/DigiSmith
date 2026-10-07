import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import { createImportOrdersCommand } from "./import-orders.ts";
import { block, listBody, detailBody, LIST_URL, DETAIL_URL, DUMMY_SECRETS, FAKE_PRIVATE } from "./test-fixtures.ts";

const PASTE = [
  block(1, LIST_URL(), listBody([5, 6])),
  block(2, DETAIL_URL(5), detailBody()),
  block(3, DETAIL_URL(6), "not json"),
].join("\n");

async function run(args: string[], stdin = () => PASTE) {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
  vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  const cli = yargs(args).command(createImportOrdersCommand(stdin)).fail(false);
  try {
    await cli.parseAsync();
  } catch (e) {
    err.push(String((e as Error).message));
  }
  return { out: out.join("\n"), err: err.join("\n") };
}

describe("shopee import-orders", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reads stdin with - and prints a table", async () => {
    const { out } = await run(["import-orders", "-"]);
    expect(out).toContain("Widget, large");
    expect(out).toContain("missing detail: 1, skipped blocks: 1");
    expect(process.exitCode).toBe(0);
  });

  it("reads a file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopee-"));
    const file = path.join(dir, "paste.txt");
    fs.writeFileSync(file, PASTE);
    const { out } = await run(["import-orders", file], () => "");
    expect(out).toContain("Gadget");
    fs.rmSync(dir, { recursive: true });
  });

  it("supports --json and --csv", async () => {
    expect(JSON.parse((await run(["import-orders", "-", "--json"])).out).orders).toHaveLength(2);
    expect((await run(["import-orders", "-", "--csv"])).out.split("\n")[0]).toContain("order id");
  });

  it("rejects --json with --csv", async () => {
    const { err } = await run(["import-orders", "-", "--json", "--csv"]);
    expect(err).toMatch(/json|csv/i);
  });

  it("never outputs Request secrets or private data", async () => {
    for (const flag of [[], ["--json"], ["--csv"]]) {
      const { out, err } = await run(["import-orders", "-", ...flag]);
      for (const s of [...DUMMY_SECRETS, ...FAKE_PRIVATE]) {
        expect(out).not.toContain(s);
        expect(err).not.toContain(s);
      }
    }
  });

  it("names only the block number in a block error", async () => {
    const { err } = await run(["import-orders", "-"]);
    expect(err).toContain("block 3: body is not JSON");
  });

  it("exits 1 for a missing file, empty stdin or no list", async () => {
    await run(["import-orders", "/nonexistent/paste.txt"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    await run(["import-orders", "-"], () => "  ");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    const r = await run(["import-orders", "-"], () => block(1, DETAIL_URL(1), detailBody()));
    expect(r.err).toContain("no order list found");
    expect(process.exitCode).toBe(1);
  });

  it("states the x100000 rule and no live call in help", async () => {
    const help = await yargs(["import-orders", "--help"])
      .command(createImportOrdersCommand())
      .exitProcess(false)
      .getHelp();
    expect(help).toContain("x100000");
    expect(help).toContain("no live call");
  });
});
