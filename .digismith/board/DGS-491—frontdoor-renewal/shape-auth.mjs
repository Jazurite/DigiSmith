// Shape-only: compare the Frontdoor Authorization JWT with the refresh response tokens. Prints claim NAMES, lengths, same/different, exp/iat only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2]; const files = readdirSync(dir);
const rd = (pre) => readFileSync(join(dir, files.find((f) => f.startsWith(pre))), "utf-8");
const claims = (t) => { const p = t.split("."); return { hdr: JSON.parse(Buffer.from(p[0], "base64url")), pl: JSON.parse(Buffer.from(p[1], "base64url")), len: t.length, sig: p[2].length }; };
const shape = (n, t) => { const c = claims(t); console.log(n, "len", c.len, "header keys", Object.keys(c.hdr).join(","), "alg", c.hdr.alg, "| claim names", Object.keys(c.pl).join(","), "| iat", c.pl.iat, "exp", c.pl.exp, "ttl_h", ((c.pl.exp - c.pl.iat) / 3600).toFixed(2)); return c; };
const resTok = (n) => JSON.parse(rd(`[${n}] Response`).split(/\r?\n\r?\n/).slice(1).join("\n\n")).token;
const t71 = resTok(71), t229 = resTok(229), t281 = resTok(281);
const req130 = rd("[130] Request"); const auth = /^authorization:\s*(.*)$/im.exec(req130)[1].trim().replace(/^Bearer\s+/i, "");
const a = shape("auth@130", auth), b = shape("tok@71 ", t71); shape("tok@229", t229); shape("tok@281", t281);
const A = a.pl, B = b.pl;
console.log("claims equal except exp/iat?", Object.keys(A).every((k) => k === "exp" || k === "iat" || JSON.stringify(A[k]) === JSON.stringify(B[k])), "| same iat:", A.iat === B.iat, "| same exp:", A.exp === B.exp);
console.log("header equal:", JSON.stringify(a.hdr) === JSON.stringify(b.hdr));
console.log("claims differing (names only):", Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])).join(",") || "none");
// which Authorization token do later Frontdoor calls use, vs. when refreshes happened (call numbers)
