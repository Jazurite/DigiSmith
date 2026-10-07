import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readFolder } from "./folder.ts";
import { joinBlocks } from "./join.ts";
import { listBody, detailBody, DUMMY_SECRETS, FAKE_PRIVATE } from "./test-fixtures.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function exportFolder(
  calls: Array<{ n: number; endpoint: string; query: string; body: unknown }>,
  eol = "\n"
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopee-folder-"));
  dirs.push(dir);
  for (const c of calls) {
    const reqPath = `/api/v4/order/${c.endpoint}?${c.query}`;
    const req = [
      `GET ${reqPath} HTTP/1.1`,
      "Host: shopee.vn",
      `Cookie: session=${DUMMY_SECRETS[0]}`,
      `X-CSRFToken: ${DUMMY_SECRETS[1]}`,
      `x-sap-sec: ${DUMMY_SECRETS[2]}`,
      `af-ac-enc-dat: ${DUMMY_SECRETS[3]}`,
      "",
      `{"note":"${DUMMY_SECRETS[4]}"}`,
    ].join(eol);
    const res = [
      "HTTP/1.1 200 OK",
      "content-type: application/json",
      `Set-Cookie: SPC_ST=${DUMMY_SECRETS[0]}`,
      "",
      typeof c.body === "string" ? c.body : JSON.stringify(c.body),
    ].join(eol);
    fs.writeFileSync(path.join(dir, `[${c.n}] Request - shopee.vn_api_v4_order_${c.endpoint}.json.txt`), req);
    fs.writeFileSync(path.join(dir, `[${c.n}] Response - shopee.vn_api_v4_order_${c.endpoint}.json.txt`), res);
  }
  return dir;
}

describe("readFolder", () => {
  it("pairs request and response files by number", () => {
    const dir = exportFolder([
      { n: 3, endpoint: "get_all_order_and_checkout_list", query: "limit=5&offset=0", body: listBody([5]) },
      { n: 4, endpoint: "get_order_detail", query: "_oft=2048&order_id=5", body: detailBody() },
    ]);
    const { blocks, errors } = readFolder(dir);
    expect(errors).toEqual([]);
    expect(blocks.map((b) => [b.n, b.kind, b.orderId, b.offset])).toEqual([
      [3, "list", undefined, "0"],
      [4, "detail", "5", undefined],
    ]);
    expect(joinBlocks({ blocks, errors }).orders[0].purchasedAt?.toISOString()).toBe("2026-10-07T01:56:38.000Z");
  });

  it("handles CRLF files", () => {
    const dir = exportFolder([{ n: 1, endpoint: "get_order_detail", query: "order_id=9", body: detailBody() }], "\r\n");
    expect(readFolder(dir).blocks).toHaveLength(1);
  });

  it("never returns request or response header values", () => {
    const dir = exportFolder([
      { n: 1, endpoint: "get_all_order_and_checkout_list", query: "limit=5&offset=0", body: listBody([1]) },
      { n: 2, endpoint: "get_order_detail", query: "order_id=1", body: "not json" },
    ]);
    const result = readFolder(dir);
    const dump = JSON.stringify(result);
    for (const s of [...DUMMY_SECRETS, ...FAKE_PRIVATE]) expect(dump).not.toContain(s);
    expect(result.errors).toEqual(["block 2: body is not JSON"]);
  });

  it("reads a large Request file by its first line only", () => {
    const dir = exportFolder([{ n: 1, endpoint: "get_order_detail", query: "order_id=9", body: detailBody() }]);
    const reqFile = path.join(dir, "[1] Request - shopee.vn_api_v4_order_get_order_detail.json.txt");
    fs.writeFileSync(reqFile, "GET /api/v4/order/get_order_detail?order_id=9 HTTP/1.1\n" + "x".repeat(5_000_000));
    expect(readFolder(dir).blocks.map((b) => b.orderId)).toEqual(["9"]);
  });

  it("reports a missing Response file and a bad request line by number", () => {
    const dir = exportFolder([{ n: 1, endpoint: "get_order_detail", query: "order_id=9", body: detailBody() }]);
    fs.rmSync(path.join(dir, "[1] Response - shopee.vn_api_v4_order_get_order_detail.json.txt"));
    fs.writeFileSync(path.join(dir, "[2] Request - shopee.vn_api_v4_order_x.json.txt"), `garbage ${DUMMY_SECRETS[0]}\n`);
    const { errors } = readFolder(dir);
    expect(errors).toEqual(["block 1: no Response file", "block 2: bad request line"]);
    expect(JSON.stringify(errors)).not.toContain(DUMMY_SECRETS[0]);
  });

  it("ignores other endpoints and unrelated files", () => {
    const dir = exportFolder([{ n: 1, endpoint: "other", query: "x=1", body: "not json" }]);
    fs.writeFileSync(path.join(dir, "notes.txt"), "hello");
    expect(readFolder(dir)).toEqual({ blocks: [], errors: [] });
  });
});
