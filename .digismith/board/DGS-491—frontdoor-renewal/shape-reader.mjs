// Shape-only reader for the DGS-491 capture. Prints names, attributes, lengths, exp, same/changed. Never a value.
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const dir = process.argv[2];
const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8); // in-memory compare only; ids are labelled A, B, ... below
const labels = new Map();
const lab = (s) => { const k = h(s); if (!labels.has(k)) labels.set(k, String.fromCharCode(65 + labels.size)); return labels.get(k); };

const files = readdirSync(dir);
function split(raw) {
  const sep = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const at = raw.indexOf(sep);
  return { head: (at === -1 ? raw : raw.slice(0, at)).split(/\r?\n/), body: at === -1 ? "" : raw.slice(at + sep.length) };
}
function headers(lines) { const out = []; for (const l of lines.slice(1)) { const c = l.indexOf(":"); if (c > 0) out.push([l.slice(0, c).trim(), l.slice(c + 1).trim()]); } return out; }
const get = (hs, n) => hs.filter(([k]) => k.toLowerCase() === n.toLowerCase()).map(([, v]) => v);
function cookies(v) { return (v ?? "").split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }); }
function exp(tok) { try { const m = /^(?:Bearer\s+)?(eyJ[\w-]+)\.([\w-]+)\.[\w-]+$/.exec(tok); if (!m) return undefined; return JSON.parse(Buffer.from(m[2], "base64url").toString()).exp; } catch { return undefined; } }
const iso = (s) => (s === undefined ? "?" : new Date(s * 1000).toISOString().slice(0, 19) + "Z");

function load(n) {
  const rq = files.find((f) => f.startsWith(`[${n}] Request`));
  const rs = files.find((f) => f.startsWith(`[${n}] Response`));
  const q = split(readFileSync(join(dir, rq), "utf-8"));
  const r = rs ? split(readFileSync(join(dir, rs), "utf-8")) : undefined;
  return { n, q, r, qh: headers(q.head), rh: r ? headers(r.head) : [] };
}

const refreshCalls = [71, 220, 229, 281, 304].map(load);
let prevSet; // cookie name -> value of previous response's Set-Cookie
const toks = [];
for (const c of refreshCalls) {
  console.log(`\n=== call ${c.n}: ${c.q.head[0].replace(/ HTTP\/[\d.]+$/, "")} -> ${c.r?.head[0] ?? "no response"}`);
  console.log("request header names:", c.qh.map(([k]) => k).join(", "));
  const ck = cookies(get(c.qh, "cookie")[0]);
  console.log("request cookie names+len+id:", ck.map(([k, v]) => `${k}(${v.length},${lab(v)})`).join(" "));
  console.log("Date:", get(c.rh, "date")[0] ?? "?");
  const sc = get(c.rh, "set-cookie");
  const setMap = new Map();
  for (const s of sc) {
    const parts = s.split(/;\s*/); const i = parts[0].indexOf("="); const name = parts[0].slice(0, i), val = parts[0].slice(i + 1);
    setMap.set(name, val);
    const attrs = parts.slice(1).map((a) => a.split("=")[0] + (/^(domain|path|max-age|expires|samesite)$/i.test(a.split("=")[0]) ? "=" + a.slice(a.indexOf("=") + 1) : "")).join("; ");
    console.log(`  Set-Cookie ${name} len=${val.length} id=${lab(val)} attrs: ${attrs}`);
  }
  if (prevSet) {
    for (const [k, v] of ck) if (prevSet.has(k)) console.log(`  req cookie ${k} == previous response Set-Cookie: ${prevSet.get(k) === v ? "SAME" : "CHANGED"}`);
  }
  if (sc.length) prevSet = setMap;
  for (const n of ["x-csrf", "sessionid", "x-workspace-id", "origin", "referer", "build-version"]) { const v = get(c.qh, n)[0]; if (v !== undefined) console.log(`  ${n}: len=${v.length} id=${lab(v)}${["origin", "referer", "x-workspace-id"].includes(n) ? " value=" + v : ""}`); }
  const csrf = get(c.qh, "x-csrf")[0]; if (csrf) console.log("  X-CSRF equals a cookie value:", ck.filter(([, v]) => v === csrf).map(([k]) => k).join(",") || "no");
  if (c.r && c.r.body) { try { const b = JSON.parse(c.r.body); const tk = b.token; console.log("  body keys:", Object.keys(b).join(","), "| token len", tk?.length, "id", tk ? lab(tk) : "-", "exp", iso(exp(tk)), "| expiration field:", b.expiration, b.expiration > 1e11 ? iso(b.expiration / 1000) : iso(b.expiration)); console.log("  metadata:", JSON.stringify(b.access_token_metadata ? { ...b.access_token_metadata, expiration: b.access_token_metadata.expiration } : null), JSON.stringify(b.refresh_token_metadata)); if (tk) toks.push([c.n, tk]); } catch { console.log("  body not JSON, len", c.r.body.length); } }
  console.log("  request body: len", c.q.body.length);
}

console.log("\n=== Authorization on Frontdoor/other calls vs returned tokens");
const all = files.map((f) => /^\[(\d+)\] Request/.exec(f)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
const tokId = new Map(toks.map(([n, t]) => [t, n]));
const seen = new Map();
for (const n of all) {
  const c = load(n); const a = get(c.qh, "authorization")[0]; if (!a) continue;
  const host = get(c.qh, "host")[0] ?? "?";
  const bare = a.replace(/^Bearer\s+/i, "");
  const fmt = /^Bearer\s/i.test(a) ? "Bearer-prefix" : "bare";
  const key = `${host} ${fmt} id=${lab(bare)} exp=${iso(exp(a))} matchesRefreshToken=${tokId.has(bare) ? "call " + tokId.get(bare) : "no"}`;
  const e = seen.get(key) ?? { first: n, last: n, count: 0 }; e.last = n; e.count++; seen.set(key, e);
}
for (const [k, e] of seen) console.log(`calls ${e.first}..${e.last} (x${e.count}): ${k}`);
