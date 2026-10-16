// Shape-only: which call first returns a JWT whose payload has a workspace_id claim (response body or Set-Cookie). Prints call numbers, request lines (query values masked), claim names only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2]; const files = readdirSync(dir);
const JWT = /eyJ[\w-]+\.([\w-]+)\.[\w-]+/g;
const auth130 = /^authorization:\s*(?:Bearer\s+)?(\S+)/im.exec(readFileSync(join(dir, files.find((f) => f.startsWith("[130] Request"))), "utf-8"))[1];
for (const f of files.filter((f) => /^\[\d+\] Response/.test(f)).sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]))) {
  const n = Number(/\d+/.exec(f)[0]); if (n > 140) continue;
  const raw = readFileSync(join(dir, f), "utf-8");
  for (const m of raw.matchAll(JWT)) {
    let pl; try { pl = JSON.parse(Buffer.from(m[1], "base64url")); } catch { continue; }
    if (!("workspace_id" in pl)) continue;
    const rq = readFileSync(join(dir, files.find((x) => x.startsWith(`[${n}] Request`))), "utf-8");
    const line = rq.split(/\r?\n/)[0].replace(/ HTTP\/[\d.]+$/, "").replace(/([?&][^=&\s]+)=[^&\s]*/g, "$1=<v>");
    const hdrNames = rq.split(/\r?\n\r?\n/)[0].split(/\r?\n/).slice(1).map((l) => l.split(":")[0]).join(",");
    console.log(`call ${n}: ${line} | same as Frontdoor Authorization: ${m[0] === auth130} | req header names: ${hdrNames} | claims: ${Object.keys(pl).join(",")}`);
  }
}
