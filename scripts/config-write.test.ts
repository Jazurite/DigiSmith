import { describe, it, expect } from "vitest";
import { ConfigError, parseConfig } from "./config-parse.ts";
import { HEADER, clearInText, formatScalar, setInText, splitKey } from "./config-write.ts";

describe("HEADER", () => {
  it("locks the new-file header", () => {
    expect(HEADER).toBe("# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.");
  });
});

describe("splitKey", () => {
  it("splits a section key and keeps a top-level key whole", () => {
    expect(splitKey("preferences.ssh_key")).toEqual({ section: "preferences", name: "ssh_key" });
    expect(splitKey("profile")).toEqual({ section: null, name: "profile" });
  });

  it.each(["A", "a.b.c", "a.", "", "a-b"])("rejects %j", (key) => {
    expect(() => splitKey(key)).toThrow(`invalid key '${key}'`);
  });
});

describe("formatScalar", () => {
  it.each([
    ["merge_locally", "merge_locally"],
    ["", '""'],
    [" x", '" x"'],
    ["x ", '"x "'],
    ['"x', `'"x'`],
    ["'x", `"'x"`],
    ["a #b", '"a #b"'],
    ["#x", '"#x"'],
    ["[x", '"[x"'],
    ["{x", '"{x"'],
    ["|", '"|"'],
    [">", '">"'],
    ["it's", "it's"],
    ['say "hi"', 'say "hi"'],
    ["https://x.com/#a", "https://x.com/#a"],
  ])("formats %j as %j", (value, expected) => {
    expect(formatScalar(value)).toBe(expected);
  });

  it("rejects a value that needs quotes and contains both quote types", () => {
    expect(() => formatScalar(`'a" #`)).toThrow(ConfigError);
    expect(() => formatScalar(`'a" #`)).toThrow("contains both quote types");
  });

  it("rejects a line break", () => {
    expect(() => formatScalar("a\nb")).toThrow("a value cannot contain a line break");
  });

  it.each(["merge_locally", "", " x", '"x', "'x", "a #b", "#x", "[x", "|", "it's", 'say "hi"', "c:\\temp", "08"])(
    "round-trips %j through the parser",
    (value) => {
      expect(parseConfig(`k: ${formatScalar(value)}\n`).get("k")).toBe(value);
    },
  );
});

describe("setInText", () => {
  it("starts a new file with the header and a top-level key", () => {
    expect(setInText("", "profile", "digismith")).toBe(`${HEADER}\nprofile: digismith\n`);
  });

  it("starts a new file with the header, a blank line and a section", () => {
    expect(setInText("", "preferences.finish_option", "merge_locally")).toBe(
      `${HEADER}\n\npreferences:\n  finish_option: merge_locally\n`,
    );
  });

  it("replaces a top-level value and keeps its inline comment", () => {
    expect(setInText("a: x   # note\n", "a", "y")).toBe("a: y   # note\n");
  });

  it("replaces a section value and keeps its inline comment", () => {
    expect(setInText("s:\n  k: 1  # c\n", "s.k", "2")).toBe("s:\n  k: 2  # c\n");
  });

  it("adds a top-level key after the last top-level key, before the first heading", () => {
    expect(setInText("# h\nprofile: p\n\npreferences:\n  a: 1\n", "role", "w")).toBe(
      "# h\nprofile: p\nrole: w\n\npreferences:\n  a: 1\n",
    );
  });

  it("adds a top-level key before the first heading when there is no top-level key", () => {
    expect(setInText("# h\npreferences:\n  a: 1\n", "profile", "p")).toBe("# h\nprofile: p\n\npreferences:\n  a: 1\n");
  });

  it("adds a section key at the end of its section, before the next heading", () => {
    expect(setInText("s:\n  a: 1\n\nt:\n  b: 2\n", "s.c", "3")).toBe("s:\n  a: 1\n  c: 3\n\nt:\n  b: 2\n");
  });

  it("adds a section key after an array that ends the section", () => {
    expect(setInText("s:\n  l:\n    - x\n", "s.k", "v")).toBe("s:\n  l:\n    - x\n  k: v\n");
  });

  it("adds a missing section at the end of the file after a blank line", () => {
    expect(setInText("profile: p\n", "preferences.a", "1")).toBe("profile: p\n\npreferences:\n  a: 1\n");
  });

  it("keeps comments and blank lines elsewhere", () => {
    expect(setInText("# one\n\n# two\na: 1\n", "a", "2")).toBe("# one\n\n# two\na: 2\n");
  });

  it("quotes a value that needs quotes", () => {
    expect(setInText("", "a", "x #y")).toBe(`${HEADER}\na: "x #y"\n`);
  });

  it("writes LF line endings for CRLF input", () => {
    expect(setInText("a: x\r\n", "b", "y")).toBe("a: x\nb: y\n");
  });

  it("refuses to overwrite an array", () => {
    expect(() => setInText("l:\n  - x\n", "l", "y")).toThrow("'l' is an array; edit it by hand");
  });

  it("refuses to write a heading name as a key", () => {
    expect(() => setInText("s:\n  a: 1\n", "s", "x")).toThrow("'s' is a heading, not a key");
  });

  it("refuses to write under a top-level scalar", () => {
    expect(() => setInText("s: x\n", "s.a", "1")).toThrow("'s' is a key, not a heading");
  });

  it("passes a parse error through with its label", () => {
    expect(() => setInText("x\n", "a", "1", ".digismith/config.yml")).toThrow(
      ".digismith/config.yml line 1: expected 'key: value'",
    );
  });
});

describe("clearInText", () => {
  it("removes a top-level key line", () => {
    expect(clearInText("a: 1\nb: 2\n", "a")).toBe("b: 2\n");
  });

  it("removes an array with its item lines", () => {
    expect(clearInText("l:\n  - x\n  - y\nb: 2\n", "l")).toBe("b: 2\n");
  });

  it("removes the heading when its last key goes, and trailing blank lines", () => {
    expect(clearInText("p: 1\n\ns:\n  a: 1\n", "s.a")).toBe("p: 1\n");
  });

  it("keeps the heading while other keys remain", () => {
    expect(clearInText("s:\n  a: 1\n  b: 2\n", "s.a")).toBe("s:\n  b: 2\n");
  });

  it("returns the text unchanged when the key is absent", () => {
    const text = "a: 1\r\n";
    expect(clearInText(text, "b")).toBe(text);
  });
});
