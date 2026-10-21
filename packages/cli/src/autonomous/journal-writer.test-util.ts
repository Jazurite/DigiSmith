import { plan, settle } from "./journal.ts";
const [dir, tag, n] = process.argv.slice(2);
for (let i = 0; i < Number(n); i++) {
  const key = plan(dir, new Date(), { ticket: "DGS-9", phase: "building", attempt: 1, action: `w-${tag}-${i}` });
  settle(dir, new Date(), key, "succeeded");
}
