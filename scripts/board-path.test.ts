import { describe, it, expect } from "vitest";
import { BOARD_DIR_PATH, slugify, buildFolderName, boardRelPath, parseFolderName } from "./board-path.ts";

describe("slugify", () => {
  it("lowercases, drops filler words, and hyphenates", () => {
    expect(slugify("Fix Cart Drawer Padding")).toBe("fix-cart-drawer-padding");
  });

  it("drops filler words wherever they sit, including mid-title", () => {
    expect(slugify("Paidy tooltip on JP PDP")).toBe("paidy-tooltip-jp-pdp");
  });

  it("is deterministic across repeated calls", () => {
    const title = "Ticket-based naming: modify the code and move the files";
    expect(slugify(title)).toBe(slugify(title));
  });

  it("spends the ~40-character budget on the original word sequence, fillers included, then drops fillers from what survives", () => {
    // jira-intake's own worked example (skills/jira-intake/SKILL.md, Step 3.1). "checkout" alone
    // would still fit a filler-dropped budget (39 chars), so the budget must be spent before
    // fillers are dropped for this example to land where it does.
    expect(slugify("Fix cart drawer padding on mobile checkout")).toBe("fix-cart-drawer-padding-mobile");
  });

  it("never leaves a trailing filler word when one would otherwise land at the truncation boundary", () => {
    // "to" is the last word the 40-char budget admits (cumulative length 28); the next word
    // would push it to 44 and is excluded. Without dropping fillers *after* truncation, "to"
    // would be the trailing word in the output — it must not be.
    const title = "alpha bravo charlie delta to fourteenchars12";
    expect(slugify(title)).toBe("alpha-bravo-charlie-delta");
  });

  it("collapses non-alphanumeric runs to a single hyphen", () => {
    expect(slugify("Theme --- access_token!! setup")).toBe("theme-access-token-setup");
  });
});

describe("buildFolderName", () => {
  it("uppercases the key and joins with an em dash (U+2014)", () => {
    expect(buildFolderName("dgs-159", "Fix cart drawer padding")).toBe(
      "DGS-159—fix-cart-drawer-padding",
    );
  });

  it("round-trips through parseFolderName", () => {
    const name = buildFolderName("dgs-158", "Ticket-based naming architecture");
    expect(parseFolderName(name)).toEqual({ key: "DGS-158", slug: "ticket-based-naming-architecture" });
  });

  it("throws rather than building a trailing-dash folder name when the title has no slug-able content", () => {
    // Non-ASCII only: slugify drops every character (none are a-z0-9), leaving an empty slug.
    expect(() => buildFolderName("dgs-1", "モバイル")).toThrow(
      "cannot build a board folder name: title has no slug-able content",
    );
  });

  it("throws when the title is entirely filler words", () => {
    expect(() => buildFolderName("dgs-1", "To Of For")).toThrow(
      "cannot build a board folder name: title has no slug-able content",
    );
  });
});

describe("boardRelPath", () => {
  it("joins the board dir with the built folder name", () => {
    expect(boardRelPath("DGS-159", "Fix cart drawer padding")).toBe(
      `${BOARD_DIR_PATH}/DGS-159—fix-cart-drawer-padding`,
    );
  });
});

describe("parseFolderName", () => {
  it("splits at the em dash and uppercases the key", () => {
    expect(parseFolderName("dgs-159—ticket-based-naming")).toEqual({
      key: "DGS-159",
      slug: "ticket-based-naming",
    });
  });

  it("splits at the first em dash when more than one is present", () => {
    // slugify can never itself produce U+2014, but parse defends against it anyway — first
    // occurrence wins, matching the design's own "unambiguous" rationale.
    expect(parseFolderName("DGS-1—slug—with-another-dash")).toEqual({
      key: "DGS-1",
      slug: "slug—with-another-dash",
    });
  });

  it("fails loudly on a plain hyphen substituted for the em dash", () => {
    expect(() => parseFolderName("DGS-159-ticket-based-naming")).toThrow(
      "no em dash (U+2014) found",
    );
  });

  it("fails loudly on an en dash substituted for the em dash", () => {
    expect(() => parseFolderName("DGS-159–ticket-based-naming")).toThrow(
      "no em dash (U+2014) found",
    );
  });

  it("rejects a key that isn't <PREFIX>-<number>", () => {
    expect(() => parseFolderName("not-a-key—some-slug")).toThrow(
      "key part is not <PREFIX>-<number>",
    );
  });

  it("matches a key case-insensitively", () => {
    expect(parseFolderName("dgs-1—slug").key).toBe("DGS-1");
    expect(parseFolderName("DGS-1—slug").key).toBe("DGS-1");
  });
});
