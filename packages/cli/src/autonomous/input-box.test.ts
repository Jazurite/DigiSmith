import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyInputBox } from "./input-box.ts";

const fx = (n: string) => readFileSync(join(import.meta.dirname, "fixtures", n), "utf8");
const ESC = "\u001b";
const R = "─".repeat(12);
// a Claude Code input box: rule, prompt line (❯ + NBSP), rule
const box = (...lines: string[]) => [R, ...lines, R].join("\n");

describe("classifyInputBox", () => {
  it("real captures", () => {
    expect(classifyInputBox(fx("input-box-empty.ansi"))).toBe("empty");
    expect(classifyInputBox(fx("input-box-suggestion.ansi"))).toBe("suggestion");
    expect(classifyInputBox(fx("input-box-typed.ansi"))).toBe("typed");
  });

  it("hand-built: empty, grey suggestion, typed", () => {
    expect(classifyInputBox(`╭────╮\n│ ❯ ${ESC}[0m │\n╰────╯`)).toBe("empty");
    expect(classifyInputBox(`╭────╮\n│ ❯ ${ESC}[2mrun the tests${ESC}[0m │\n╰────╯`)).toBe("suggestion");
    expect(classifyInputBox(`╭────╮\n│ ❯ hello │\n╰────╯`)).toBe("typed");
  });

  it("anything it cannot read is unknown", () => {
    expect(classifyInputBox("")).toBe("unknown");
    expect(classifyInputBox("just some log text\nno box here")).toBe("unknown");
  });

  it("a log line with a bare > is not an input box", () => {
    expect(classifyInputBox("build output\n> \nmore log")).toBe("unknown");
    expect(classifyInputBox("ran a > b and got\n")).toBe("unknown");
  });

  it("F1: reset codes before or after the prompt do not hide it", () => {
    expect(classifyInputBox(box(`${ESC}[0m❯ `))).toBe("empty");
    expect(classifyInputBox(box(`${ESC}[0m❯ ${ESC}[2mrun the tests${ESC}[0m`))).toBe("suggestion");
    expect(classifyInputBox(box(`${ESC}[0m❯ hi${ESC}[0m`))).toBe("typed");
  });

  it("F3: a trimmed prompt (no trailing NBSP) is empty", () => {
    expect(classifyInputBox(box("❯"))).toBe("empty");
    expect(classifyInputBox(box(`❯${ESC}[0m`))).toBe("empty");
  });

  it("F3: multi-line typed input is typed", () => {
    expect(classifyInputBox(box("❯ first line", "  second line"))).toBe("typed");
    expect(classifyInputBox(box("❯ ", "second line"))).toBe("typed");
  });

  it("F3: a prompt outside a rule box is unknown (starship-style line)", () => {
    expect(classifyInputBox(`starship output\n❯ \nmore`)).toBe("unknown");
    expect(classifyInputBox(`❯ hi`)).toBe("unknown");
    expect(classifyInputBox(`❯ hi\n${R}`)).toBe("unknown");
  });

  it("F2: grey must cover all of the text; mid-text grey is typed", () => {
    expect(classifyInputBox(box(`❯ hello ${ESC}[2mworld${ESC}[0m`))).toBe("typed");
    expect(classifyInputBox(box(`❯ ${ESC}[2mrun${ESC}[0m the tests`))).toBe("typed");
    expect(classifyInputBox(box(`❯ run ${ESC}[2mthe tests${ESC}[0m`))).toBe("typed");
  });

  it("F2: a non-grey SGR is not grey (38;5;2m look-alike and bold)", () => {
    expect(classifyInputBox(box(`❯ ${ESC}[38;5;2mrun the tests${ESC}[0m`))).toBe("typed");
    expect(classifyInputBox(box(`❯ ${ESC}[1mrun the tests${ESC}[0m`))).toBe("typed");
  });
});
