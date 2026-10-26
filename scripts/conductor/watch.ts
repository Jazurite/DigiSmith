// Bounded mtime walk for state-refresh's Watch paths (DGS-577).
import * as fs from "node:fs";
import * as path from "node:path";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 2000;

/** The newest mtime of a file, or of the files in a folder (depth 3, at most 2000 entries); undefined when the path does not exist. */
export function newestMtime(p: string): { time: Date; entries: number } | undefined {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return undefined;
  }
  let newest = st.mtime;
  let entries = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (++entries > MAX_ENTRIES) return;
      const full = path.join(dir, name);
      let s: fs.Stats;
      try {
        s = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (s.isFile() && s.mtime > newest) newest = s.mtime;
      if (s.isDirectory()) walk(full, depth + 1);
    }
  };
  if (st.isDirectory()) {
    newest = new Date(0);
    walk(p, 1);
    if (newest.getTime() === 0) newest = st.mtime;
  }
  return { time: newest, entries };
}
