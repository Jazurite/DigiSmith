import * as fs from "node:fs";
import * as path from "node:path";
import { buildBlock, classify, type PasteBlock, type PasteResult } from "./paste.ts";

const FILE = /^\[(\d+)\] (Request|Response) - /;
const MAX_REQUEST_LINE = 64 * 1024;

// Reads the first line of a Request file and nothing else: the rest holds live
// cookies and tokens, so the file is read in small chunks and never whole.
function readFirstLine(file: string): string {
  const fd = fs.openSync(file, "r");
  try {
    const chunk = Buffer.alloc(1024);
    let line = "";
    let total = 0;
    while (total < MAX_REQUEST_LINE) {
      const got = fs.readSync(fd, chunk, 0, chunk.length, total);
      if (got === 0) break;
      total += got;
      const text = chunk.toString("utf-8", 0, got);
      const nl = text.search(/\r?\n/);
      if (nl >= 0) return line + text.slice(0, nl);
      line += text;
    }
    return line;
  } finally {
    fs.closeSync(fd);
  }
}

// Response file: status line, headers (skipped, they hold Set-Cookie), the
// first blank line, then the JSON body. Only the body is returned.
function readBody(file: string): string {
  const text = fs.readFileSync(file, "utf-8");
  const m = /\r?\n\r?\n/.exec(text);
  return m ? text.slice(m.index + m[0].length) : "";
}

export function readFolder(dir: string): PasteResult {
  const requests = new Map<number, string>();
  const responses = new Map<number, string>();
  for (const name of fs.readdirSync(dir)) {
    const m = FILE.exec(name);
    if (!m) continue;
    (m[2] === "Request" ? requests : responses).set(Number(m[1]), path.join(dir, name));
  }
  const blocks: PasteBlock[] = [];
  const errors: string[] = [];
  for (const n of [...requests.keys()].sort((a, b) => a - b)) {
    const m = /^[A-Z]+ (\S+) HTTP\/[\d.]+/.exec(readFirstLine(requests.get(n)!));
    let url: URL | null = null;
    if (m) {
      try {
        url = new URL(m[1], "https://shopee.vn");
      } catch {
        url = null;
      }
    }
    if (!url) {
      errors.push(`block ${n}: bad request line`);
      continue;
    }
    const kind = classify(url);
    if (!kind) continue;
    const resFile = responses.get(n);
    if (!resFile) {
      errors.push(`block ${n}: no Response file`);
      continue;
    }
    const block = buildBlock(n, kind, url, readBody(resFile), errors);
    if (block) blocks.push(block);
  }
  return { blocks, errors };
}
