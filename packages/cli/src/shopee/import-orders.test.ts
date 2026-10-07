import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import { createImportOrdersCommand, collectSkipIds, parseSkipFile } from "./import-orders.ts";
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
    expect(out).toContain("missing detail: 1, skipped blocks: 1, skipped list entries: 0");
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

  it("reads a Proxyman Raw export folder and leaks nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopee-raw-"));
    const put = (n: number, kind: string, ep: string, first: string, rest: string) =>
      fs.writeFileSync(path.join(dir, `[${n}] ${kind} - shopee.vn_api_v4_order_${ep}.json.txt`), first + "\n" + rest);
    const secrets = DUMMY_SECRETS.map((x) => `Cookie: ${x}`).join("\n");
    put(1, "Request", "get_all_order_and_checkout_list", "GET /api/v4/order/get_all_order_and_checkout_list?limit=5&offset=0 HTTP/1.1", secrets);
    put(1, "Response", "get_all_order_and_checkout_list", "HTTP/1.1 200 OK", `${secrets}\n\n${JSON.stringify(listBody([5]))}`);
    put(2, "Request", "get_order_detail", "GET /api/v4/order/get_order_detail?_oft=2048&order_id=5 HTTP/1.1", secrets);
    put(2, "Response", "get_order_detail", "HTTP/1.1 200 OK", `Set-Cookie: ${DUMMY_SECRETS[0]}\n\n${JSON.stringify(detailBody())}`);
    try {
      for (const flag of [[], ["--json"], ["--csv"]]) {
        const { out, err } = await run(["import-orders", dir, ...flag], () => "");
        expect(out).toContain("Widget, large");
        for (const s of [...DUMMY_SECRETS, ...FAKE_PRIVATE]) {
          expect(out).not.toContain(s);
          expect(err).not.toContain(s);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("leaves cancelled orders out of every format and leaks nothing", async () => {
    const text = [
      block(1, LIST_URL(), listBody([5, 6], { cancelledIds: [6] })),
      block(2, DETAIL_URL(5), detailBody()),
      block(3, DETAIL_URL(6), detailBody({ cancelled: true, sn: "CANCELLED-SN" })),
    ].join("\n");
    for (const flag of [[], ["--json"], ["--csv"]]) {
      const { out, err } = await run(["import-orders", "-", ...flag], () => text);
      expect(out).not.toContain("CANCELLED-SN");
      for (const s of [...DUMMY_SECRETS, ...FAKE_PRIVATE]) {
        expect(out).not.toContain(s);
        expect(err).not.toContain(s);
      }
    }
    expect((await run(["import-orders", "-"], () => text)).out).toContain("cancelled orders skipped: 1");
    expect(JSON.parse((await run(["import-orders", "-", "--json"], () => text)).out).summary.skippedCancelledOrders).toBe(1);
    expect(JSON.parse((await run(["import-orders", "-", "--json"], () => text)).out).orders.map((o: { orderId: string }) => o.orderId)).toEqual(["5"]);
  });

  describe("--skip", () => {
    const text = block(1, LIST_URL(), listBody([4, 5, 6, 7], { cancelledIds: [7] }));
    const ids = (out: string) => JSON.parse(out).orders.map((o: { orderId: string }) => o.orderId);

    it("takes a comma list", async () => {
      const { out } = await run(["import-orders", "-", "--json", "--skip", "4,5"], () => text);
      expect(ids(out)).toEqual(["6"]);
      expect(JSON.parse(out).summary).toMatchObject({ skippedByUser: 2, skippedCancelledOrders: 1 });
    });

    it("takes a repeated flag, keeping long ids as strings", async () => {
      const { out } = await run(["import-orders", "-", "--json", "--skip", "4", "--skip", "5"], () => text);
      expect(ids(out)).toEqual(["6"]);
      const big = block(1, LIST_URL(), listBody(["244619842269716", "244563673265027"]));
      expect(ids((await run(["import-orders", "-", "--json", "--skip", "244619842269716"], () => big)).out)).toEqual(["244563673265027"]);
    });

    it("reads --skip-file and ignores comments and blank lines", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopee-skip-"));
      const file = path.join(dir, "skip.txt");
      fs.writeFileSync(file, "# cancelled in real life\n4\n\n5 # refunded\n");
      try {
        const { out } = await run(["import-orders", "-", "--json", "--skip-file", file], () => text);
        expect(ids(out)).toEqual(["6"]);
      } finally {
        fs.rmSync(dir, { recursive: true });
      }
    });

    it("prints a note, not an error, for an unknown id", async () => {
      const { out, err } = await run(["import-orders", "-", "--skip", "99"], () => text);
      expect(err).toContain("note: --skip id 99 is not in the data");
      expect(out).toContain("skipped by --skip: 0");
      expect(process.exitCode).toBe(0);
    });

    it("shows the count in the table footer next to the cancelled count and leaves rows out in csv", async () => {
      const { out } = await run(["import-orders", "-", "--skip", "4"], () => text);
      expect(out).toContain("cancelled orders skipped: 1, skipped by --skip: 1");
      const csv = (await run(["import-orders", "-", "--csv", "--skip", "4,5"], () => text)).out;
      expect(csv.split("\n").slice(1).map((l) => l.split(",")[0])).toEqual(["6"]);
    });

    it("exits 1 for an unreadable skip file", async () => {
      await run(["import-orders", "-", "--skip-file", "/nonexistent/skip.txt"], () => text);
      expect(process.exitCode).toBe(1);
    });

    it("helpers", () => {
      expect(collectSkipIds(["1,2", "3"], "# c\n4\n")).toEqual(["1", "2", "3", "4"]);
      expect(parseSkipFile("a # x\n\n#only\nb")).toEqual(["a", "b"]);
    });
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
    const r = await run(["import-orders", "-"], () => block(1, "https://shopee.vn/api/v4/other", {}));
    expect(r.err).toContain("no orders found");
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
