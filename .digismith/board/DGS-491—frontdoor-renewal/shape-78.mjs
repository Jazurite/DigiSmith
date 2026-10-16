import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path"; import { createHash } from "node:crypto";
const dir = process.argv[2]; const files = readdirSync(dir);
const rd = (p) => readFileSync(join(dir, files.find((f) => f.startsWith(p))), "utf-8");
const id = (s) => createHash("sha256").update(s).digest("hex").slice(0, 6);
const rq = rd("[78] Request"), rs = rd("[78] Response");
const ck = Object.fromEntries(/^cookie:\s*(.*)$/im.exec(rq)[1].split(/;\s*/).map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const sc = {}; for (const l of rs.split(/\r?\n/)) { const m = /^set-cookie:\s*([^=]+)=([^;]*)/i.exec(l); if (m && m[2]) sc[m[1]] = m[2]; }
for (const k of ["cu_refresh", "cu_session_meta"]) console.log(k, "request==response Set-Cookie:", ck[k] === sc[k]);
console.log("request body bytes:", JSON.stringify(rq.split(/\r?\n\r?\n/).slice(1).join("")).length - 2, "content-length hdr:", /^content-length:\s*(\d+)/im.exec(rq)?.[1], "content-type hdr:", /^content-type:/im.test(rq) ? "yes" : "no");
const b = JSON.parse(rs.split(/\r?\n\r?\n/).slice(1).join("\n\n")); console.log("refresh_token field:", b.refresh_token === null ? "null" : typeof b.refresh_token);
// does call 78's token also equal the cu_jwt Set-Cookie? and does cookie cu_jwt/other cookie equal token
console.log("token == Set-Cookie cu_jwt:", sc.cu_jwt === b.token, "| attachment_token == cu_attachment_jwt:", sc.cu_attachment_jwt === b.attachment_token);
// did any call after 78 send a cu_refresh different from call 71's?
let diff = 0, n = 0; const r71 = /cu_refresh=([^;\s]+)/.exec(rd("[71] Request"))[1];
for (const f of files.filter((f) => /^\[\d+\] Request/.test(f))) { const m = /^cookie:.*?cu_refresh=([^;\s]+)/im.exec(readFileSync(join(dir, f), "utf-8")); if (m) { n++; if (m[1] !== r71) diff++; } }
console.log("requests carrying cu_refresh:", n, "of which differ from call 71's:", diff);
