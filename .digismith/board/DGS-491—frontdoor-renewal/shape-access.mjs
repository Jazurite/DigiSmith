// Shape-only look at calls to the workspace access_tokens endpoint. Names, lengths, same/changed, exp. No values except hosts, paths, the team id and non-secret trigger_source.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2]; const files = readdirSync(dir);
const nums = files.map((f) => /^\[(\d+)\] Request/.exec(f)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
const split = (raw) => { const i = raw.search(/\r?\n\r?\n/); return { head: raw.slice(0, i).split(/\r?\n/), body: raw.slice(i).replace(/^\r?\n\r?\n/, "") }; };
const cookieNames = (v) => (v ?? "").split(/;\s*/).filter(Boolean).map((p) => p.split("=")[0]);
for (const n of nums) {
  const rqf = files.find((f) => f.startsWith(`[${n}] Request`)); const rq = split(readFileSync(join(dir, rqf), "utf-8"));
  if (!/access_tokens|\/access-token/.test(rq.head[0])) continue;
  const host = /^host:\s*(.*)$/im.exec(rq.head.join("\n"))?.[1];
  const rsf = files.find((f) => f.startsWith(`[${n}] Response`)); const rs = rsf && split(readFileSync(join(dir, rsf), "utf-8"));
  const ck = /^cookie:\s*(.*)$/im.exec(rq.head.join("\n"))?.[1];
  console.log(`\ncall ${n}: ${rq.head[0].replace(/ HTTP\/[\d.]+$/, "")} host=${host} -> ${rs?.head[0]}`);
  console.log(" req header names:", rq.head.slice(1).map((l) => l.split(":")[0]).join(","));
  console.log(" req cookie names:", cookieNames(ck).filter((c) => /^cu|^cu_|session|jwt|refresh/i.test(c)).join(","));
  console.log(" req body len:", rq.body.length, "keys:", (() => { try { return Object.keys(JSON.parse(rq.body)).join(","); } catch { return "n/a"; } })());
  console.log(" Date:", rs?.head.find((l) => /^date:/i.test(l)));
  console.log(" res Set-Cookie names:", rs?.head.filter((l) => /^set-cookie:/i.test(l)).map((l) => l.slice(11).split("=")[0]).join(",") || "none");
  try { const b = JSON.parse(rs.body); const show = (o, p = "") => Object.entries(o).forEach(([k, v]) => { if (v && typeof v === "object" && !Array.isArray(v)) show(v, p + k + "."); else console.log(`  body ${p}${k}: ${typeof v}${typeof v === "string" ? " len " + v.length : ""}${/exp|ttl|seconds/i.test(k) ? " =" + v : ""}`); }); show(b);
    const t = b.access_token ?? b.token ?? b.accessToken ?? b.data?.token; } catch { console.log(" body not JSON len", rs?.body.length); }
}
