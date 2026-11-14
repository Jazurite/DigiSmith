import { describe, expect, it } from "vitest";
import type { GuideIndexEntry } from "./cache.ts";
import { resolveGuide } from "./lookup.ts";

function entry(slug: string, key: string): GuideIndexEntry {
  return { slug, key, id: `id-${slug}`, kind: "guide", name: slug, when: "", updated: "" };
}

const guides = [
  entry("close-a-ticket", "DGS-758"),
  entry("close-an-epic", "DGS-759"),
  entry("close", "DGS-100"),
  entry("start-work", "DGS-760"),
  entry("review-a-branch", "DGS-761"),
];

describe("resolveGuide", () => {
  it("exact slug wins over a prefix of another slug", () => {
    const r = resolveGuide(guides, "close");
    expect(r).toEqual({ kind: "found", guide: guides[2] });
  });

  it("matches the key in any case", () => {
    expect(resolveGuide(guides, "dgs-758")).toEqual({ kind: "found", guide: guides[0] });
    expect(resolveGuide(guides, "DGS-758")).toEqual({ kind: "found", guide: guides[0] });
  });

  it("finds a unique prefix", () => {
    expect(resolveGuide(guides, "close-a-t")).toEqual({ kind: "found", guide: guides[0] });
  });

  it("returns ambiguous with every matching slug", () => {
    const r = resolveGuide(guides.slice(0, 2), "close");
    expect(r).toEqual({ kind: "ambiguous", matches: ["close-a-ticket", "close-an-epic"] });
  });

  it("suggests a substring match when no slug starts with the input", () => {
    expect(resolveGuide(guides, "a-ticket")).toEqual({ kind: "unknown", closest: ["close-a-ticket"] });
  });

  it("returns no closest when nothing matches", () => {
    expect(resolveGuide(guides, "zz")).toEqual({ kind: "unknown", closest: [] });
  });

  it("does not suggest guides that share only one leading character", () => {
    expect(resolveGuide(guides, "cat")).toEqual({ kind: "unknown", closest: [] });
  });

  it("caps closest at exactly 3 when more guides match", () => {
    const list = ["a-foo", "b-foo", "c-foo", "d-foo"].map((s, i) => entry(s, `K-${i}`));
    expect(resolveGuide(list, "-foo")).toEqual({ kind: "unknown", closest: ["a-foo", "b-foo", "c-foo"] });
  });

  it("caps closest at 3, prefix matches first then substring", () => {
    const list = [
      entry("x-foo", "K-1"),
      entry("foo-b", "K-2"),
      entry("foo-a", "K-3"),
      entry("y-foo", "K-4"),
    ];
    // two slugs start with "foo", so the input is ambiguous
    expect(resolveGuide(list, "foo")).toEqual({ kind: "ambiguous", matches: ["foo-b", "foo-a"] });
    const u = resolveGuide(list, "oo-");
    expect(u).toEqual({ kind: "unknown", closest: ["foo-b", "foo-a"] });
    const u2 = resolveGuide([...list, entry("z-foo", "K-5")], "-foo");
    expect(u2).toEqual({ kind: "unknown", closest: ["x-foo", "y-foo", "z-foo"] });
  });

  it("shared-prefix guess ranks before substring", () => {
    const list = [entry("my-close", "K-1"), entry("closet", "K-2"), entry("closed", "K-3")];
    // "closer" shares prefix "close" with closet/closed; no slug starts with "closer"
    const u = resolveGuide(list, "closer");
    expect(u).toEqual({ kind: "unknown", closest: ["closet", "closed"] });
  });

  it("empty input is unknown with no closest", () => {
    expect(resolveGuide(guides, "")).toEqual({ kind: "unknown", closest: [] });
    expect(resolveGuide(guides, "   ")).toEqual({ kind: "unknown", closest: [] });
  });
});
