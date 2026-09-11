import { describe, expect, it } from "vitest";
import { reverseString } from "./reverse-string.ts";

describe("reverseString", () => {
  it("reverses a normal word", () => {
    expect(reverseString("hello")).toBe("olleh");
  });

  it("returns an empty string for empty input", () => {
    expect(reverseString("")).toBe("");
  });

  it("returns the same string for a palindrome", () => {
    expect(reverseString("level")).toBe("level");
  });
});
