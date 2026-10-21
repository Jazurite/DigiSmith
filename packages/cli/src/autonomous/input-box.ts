import type { InputBox } from "./phase-types.ts";

// the prompt marker of the Claude Code input box, at the start of the line (after the frame): "❯" then a NBSP.
// The text after it is what the user typed, or the grey suggestion. A bare ">" is log text, not the box.
const PROMPT = /^[\s│┃|]*❯\s/;
// dim (2) or a grey foreground: 90, 38;5;240-250, 38;2;r;g;b with r=g=b
const GREY = /\u001b\[(?:[0-9;]*;)?(?:2|90|38;5;2[34]\d|38;5;250|38;2;(\d+);\1;\1)m/;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const FRAME = /[│┃|]/g;

export function classifyInputBox(ansi: string): InputBox {
  const lines = ansi.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const bare = lines[i].replace(ANSI, (s) => (GREY.test(s) || s === "\u001b[0m" ? s : ""));
    const m = PROMPT.exec(bare);
    if (m === null) continue;
    // the same prompt, located in the raw line so the grey codes after it are still there
    const afterRaw = lines[i].slice(lines[i].indexOf("❯") + 1);
    const text = afterRaw.replace(ANSI, "").replace(FRAME, "").trim();
    if (text === "") return "empty";
    return GREY.test(afterRaw) ? "suggestion" : "typed";
  }
  return "unknown";
}
