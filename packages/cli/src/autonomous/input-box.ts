import type { InputBox } from "./phase-types.ts";

// The Claude Code input box as the pane shows it (probe.md Step 4):
//   rule                  a line starting with a run of ─ (it may carry a label); a hand-built box may use ╭────╮ / ╰────╯
//   ❯ <text>              the prompt line: "❯" then a NBSP; the text after it is typed, or the grey suggestion
//   continuation lines    more typed input, between the prompt and the bottom rule
//   rule
// Frame characters (│ ┃) may wrap the prompt line.
//
// Grey = the dim SGR attribute, ESC[2m. The real suggestion capture (fixtures/input-box-suggestion.ansi)
// draws the suggestion as ESC[2m ... ESC[0m. Any other styling (38;5;2m, bold, 90m...) is not grey.
// "suggestion" needs every non-space character after the prompt to be dim; anything else is typed.
// Whenever unsure the answer is "typed" or "unknown", never "empty": the caller uses "empty" as the send gate.

const ESC = "\u001b";
const ANY_ESC = /\u001b\[[0-9;?]*[A-Za-z]|\u001b./g;
const FRAME = /[│┃]/;
const RULE = /^\s*[╭╰]?─{4,}/;

interface Cell { ch: string; dim: boolean }

// Apply one SGR parameter list to the dim state. Extended colours (38;5;n, 38;2;r;g;b) are skipped whole,
// so the 2 in 38;5;2 is not read as dim.
function applySgr(params: string, dim: boolean): boolean {
  const codes = params === "" ? [0] : params.split(";").map((p) => (p === "" ? 0 : Number(p)));
  for (let k = 0; k < codes.length; k++) {
    const c = codes[k];
    if (c === 0 || c === 22) dim = false;
    else if (c === 2) dim = true;
    else if (c === 38 || c === 48 || c === 58) k += codes[k + 1] === 5 ? 2 : codes[k + 1] === 2 ? 4 : 0;
  }
  return dim;
}

// The visible characters of a line, each with its dim state. Escape sequences only change state.
function cellsOf(line: string): Cell[] {
  const out: Cell[] = [];
  let dim = false;
  let i = 0;
  while (i < line.length) {
    if (line[i] === ESC) {
      if (line[i + 1] === "[") {
        let j = i + 2;
        while (j < line.length && !/[A-Za-z]/.test(line[j])) j++;
        if (line[j] === "m") dim = applySgr(line.slice(i + 2, j), dim);
        i = j + 1;
      } else {
        i += 2;
      }
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i)!);
    out.push({ ch, dim });
    i += ch.length;
  }
  return out;
}

const isSpace = (ch: string) => /\s/.test(ch);

// index of the ❯ that opens the input line: only spaces or frame characters before it, then NBSP/space or the end
function promptAt(cells: Cell[]): number {
  let k = 0;
  while (k < cells.length && (isSpace(cells[k].ch) || FRAME.test(cells[k].ch))) k++;
  if (k >= cells.length || cells[k].ch !== "❯") return -1;
  return k + 1 === cells.length || isSpace(cells[k + 1].ch) ? k : -1;
}

function readBox(lines: string[], p: number): InputBox {
  const plain = (s: string) => s.replace(ANY_ESC, "");
  // the prompt must be the first line under a top rule, and a bottom rule must close the box
  if (p === 0 || !RULE.test(plain(lines[p - 1]))) return "unknown";
  let q = p + 1;
  while (q < lines.length && !RULE.test(plain(lines[q]))) q++;
  if (q >= lines.length) return "unknown";

  // continuation lines are typed input, whatever they hold
  for (let r = p + 1; r < q; r++) {
    if (plain(lines[r]).replace(/[│┃\s]/g, "") !== "") return "typed";
  }

  const cells = cellsOf(lines[p]);
  const rest = cells.slice(promptAt(cells) + 1);
  // drop the trailing padding and the closing frame, then keep the characters that are not spaces
  while (rest.length > 0 && (isSpace(rest[rest.length - 1].ch) || FRAME.test(rest[rest.length - 1].ch))) rest.pop();
  const text = rest.filter((c) => !isSpace(c.ch));
  if (text.length === 0) return "empty";
  return text.every((c) => c.dim) ? "suggestion" : "typed";
}

export function classifyInputBox(ansi: string): InputBox {
  const lines = ansi.split("\n");
  // only the lowest prompt line counts: the input box sits at the bottom of the pane
  // known gap (F5, parked): a typed continuation line starting with the prompt glyph reads unknown, which is safe because unknown means wait
  for (let p = lines.length - 1; p >= 0; p--) {
    if (promptAt(cellsOf(lines[p])) !== -1) return readBox(lines, p);
  }
  return "unknown";
}
