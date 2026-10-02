import { describe, it, expect } from "vitest";
import { ConfigError, parseConfig, parseConfigDocument, splitConfigLines } from "./config-parse.ts";

function errorOf(text: string): string {
  try {
    parseConfig(text);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("parseConfig: valid input", () => {
  it("reads top-level keys and ignores blank lines and comments", () => {
    expect(parseConfig("# header\n\nprofile: digismith\nrole: worker\n")).toEqual(
      new Map([
        ["profile", "digismith"],
        ["role", "worker"],
      ]),
    );
  });

  it("reads keys under a heading as heading.key", () => {
    expect(parseConfig("preferences:\n  finish_option: merge_locally\n  ssh_key: /k\n")).toEqual(
      new Map([
        ["preferences.finish_option", "merge_locally"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("reads a top-level array with 2-space items", () => {
    expect(parseConfig("urls:\n  - https://a.com\n  - b\n")).toEqual(new Map([["urls", ["https://a.com", "b"]]]));
  });

  it("reads an array inside a section with 4-space items", () => {
    expect(parseConfig("maestro:\n  poll: 60\n  sessions:\n    - DigiSmith\n    - emma\n  after: x\n")).toEqual(
      new Map<string, string | string[]>([
        ["maestro.poll", "60"],
        ["maestro.sessions", ["DigiSmith", "emma"]],
        ["maestro.after", "x"],
      ]),
    );
  });

  it("keeps every value a string", () => {
    expect(parseConfig("a: no\nb: 08\nc: true\n")).toEqual(
      new Map([
        ["a", "no"],
        ["b", "08"],
        ["c", "true"],
      ]),
    );
  });

  it("strips an inline comment that starts with space-hash", () => {
    expect(parseConfig("a: merge_locally   # note\n").get("a")).toBe("merge_locally");
  });

  it("keeps a # with no space before it", () => {
    expect(parseConfig("url: https://x.com/#a\n").get("url")).toBe("https://x.com/#a");
  });

  it("unwraps double and single quotes", () => {
    expect(parseConfig("a: \"x\"\nb: 'y'\n")).toEqual(
      new Map([
        ["a", "x"],
        ["b", "y"],
      ]),
    );
  });

  it("keeps space-hash inside quotes and strips the comment after them", () => {
    expect(parseConfig('a: "x # y"  # real\n').get("a")).toBe("x # y");
  });

  it("treats a backslash as a literal character", () => {
    expect(parseConfig(String.raw`a: "c:\temp\n"` + "\n").get("a")).toBe(String.raw`c:\temp\n`);
  });

  it("reads a quoted empty string as a value, not a heading", () => {
    expect(parseConfig('a: ""\n').get("a")).toBe("");
  });

  it("strips a trailing CR on each line", () => {
    expect(parseConfig("a: x\r\nb: y\r\n")).toEqual(
      new Map([
        ["a", "x"],
        ["b", "y"],
      ]),
    );
  });

  it("ignores a leading UTF-8 BOM", () => {
    expect(parseConfig("\uFEFFa: x\n").get("a")).toBe("x");
  });

  it("accepts text with no trailing newline", () => {
    expect(parseConfig("a: x").get("a")).toBe("x");
  });

  it("returns an empty map for empty text", () => {
    expect(parseConfig("")).toEqual(new Map());
  });

  it("reads today's flat preferences.yml unchanged", () => {
    const text =
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\nclear_context: no\nssh_key: /root/.ssh/jazurite_github\n";
    expect(parseConfig(text)).toEqual(
      new Map([
        ["finish_option", "merge_locally"],
        ["clear_context", "no"],
        ["ssh_key", "/root/.ssh/jazurite_github"],
      ]),
    );
  });
});

describe("parseConfig: errors", () => {
  it.each([
    ["s:\n\tk: v\n", "config.yml line 2: tab in indentation; use spaces"],
    ["s:\n  k:\n    j: v\n", "config.yml line 3: a second level of headings is not supported"],
    ["  k: v\n", "config.yml line 1: indented line with no heading above it"],
    ["urls:\n- a\n", "config.yml line 2: array items must be indented 2 spaces"],
    ["s:\n  urls:\n  - a\n", "config.yml line 3: array items must be indented 4 spaces"],
    ["s:\nt: v\n", "config.yml line 1: 's:' has no value and no indented lines under it"],
    ["s:\n", "config.yml line 1: 's:' has no value and no indented lines under it"],
    ["s:\n   k: v\n", "config.yml line 2: expected an indent of 2 spaces"],
    ["s:\n  k: v\n    j: w\n", "config.yml line 3: keys must be indented 0 or 2 spaces"],
    ["a: [x, y]\n", "config.yml line 1: flow syntax ([...] or {...}) is not supported"],
    ["a: {x: y}\n", "config.yml line 1: flow syntax ([...] or {...}) is not supported"],
    ["a: |\n", "config.yml line 1: block scalars (| or >) are not supported"],
    ["a: >-\n", "config.yml line 1: block scalars (| or >) are not supported"],
    ['a: "x" y\n', "config.yml line 1: text after the closing quote"],
    ['a: "x\n', "config.yml line 1: missing closing quote"],
    ["a: x\na: y\n", "config.yml line 2: duplicate key 'a'"],
    ["s:\n  k: 1\n  k: 2\n", "config.yml line 3: duplicate key 's.k'"],
    ["s:\n  k: 1\ns:\n  j: 2\n", "config.yml line 3: duplicate key 's'"],
    ["Bad-Key: x\n", "config.yml line 1: invalid key 'Bad-Key' (use a-z, 0-9 and _)"],
    ["just text\n", "config.yml line 1: expected 'key: value'"],
    ["a:x\n", "config.yml line 1: expected a space after ':' or '-'"],
    ["- x\n", "config.yml line 1: array item with no array key above it"],
    ["urls:\n  -\n", "config.yml line 2: empty array item"],
  ])("%j fails with %j", (text, message) => {
    expect(errorOf(text)).toBe(message);
  });

  it("names the file label in the message", () => {
    expect(() => parseConfig("x\n", ".digismith/config.yml")).toThrow(
      ".digismith/config.yml line 1: expected 'key: value'",
    );
  });
});

describe("parseConfigDocument", () => {
  it("records entry lines, inline comments, arrays and section extents", () => {
    const doc = parseConfigDocument("# h\nprofile: x  # c\n\nprefs:\n  a: 1\n  list:\n    - q\n");
    expect(doc.entries.get("profile")).toEqual({ key: "profile", line: 1, lastLine: 1, comment: "  # c", isArray: false });
    expect(doc.entries.get("prefs.a")).toEqual({ key: "prefs.a", line: 4, lastLine: 4, comment: "", isArray: false });
    expect(doc.entries.get("prefs.list")).toEqual({ key: "prefs.list", line: 5, lastLine: 6, comment: "", isArray: true });
    expect(doc.sections.get("prefs")).toEqual({ name: "prefs", line: 3, lastLine: 6 });
    expect(doc.lines).toHaveLength(7);
  });
});

describe("splitConfigLines", () => {
  it("removes a BOM, trailing CRs and the final empty line", () => {
    expect(splitConfigLines("\uFEFFa\r\nb\n")).toEqual(["a", "b"]);
  });
});
