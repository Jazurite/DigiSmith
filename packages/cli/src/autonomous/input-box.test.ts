import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyInputBox } from "./input-box.ts";

const fx = (n: string) => readFileSync(join(import.meta.dirname, "fixtures", n), "utf8");
const ESC = "\u001b";

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
});
