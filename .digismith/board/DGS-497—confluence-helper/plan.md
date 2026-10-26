# Confluence helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `attach`, `place-images`, `history` and `diff` Confluence commands to `packages/jira-client`, plus a `digismith:confluence` skill.

**Architecture:** One new module `confluence.ts` holds the Confluence REST calls and the pure placement logic. One small module `storage-diff.ts` holds the line diff. `cli.ts` gets four subcommands and one new arg parser (the old `parseArgs` cannot read boolean flags or positionals). The skill holds the approval rule. Spec: `spec.md` in this folder (approved 2026-10-26).

**Tech Stack:** TypeScript on Node 24 (run with `node --experimental-strip-types`), global `fetch`, `FormData`, vitest with a mocked `fetch`. No new dependency.

## Global Constraints

- Credentials: only `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_SITE` from `~/.digismith-depot/.env`, through the existing `checkCredentials`. Never print, log or put them in an error text.
- Writes (`attach`, `place-images`) change nothing without `--apply`. Without it they print a dry-run report.
- The version check is mandatory: PUT uses `version.number + 1`; a 409 is reported, never retried; no flag skips it.
- Comment anchors must survive: fail before the PUT if the count of `<ac:inline-comment-marker` changes.
- Image width default 760.
- Exit 0 on success and on a dry run; exit 1 on any failure with one plain line on stderr.
- pnpm only. Title-only conventional commits, no AI attribution. Test command from the repo root: `pnpm vitest run packages/jira-client`.
- Out of scope: `update-section`, page create/delete, comment edits, Jira changes, renaming the package.

## File Structure

- Create `packages/jira-client/src/confluence.ts`: REST calls and placement logic. One responsibility: talk to Confluence and rewrite a storage body.
- Create `packages/jira-client/src/confluence.test.ts`: tests for the above, mocked `fetch`.
- Create `packages/jira-client/src/storage-diff.ts` and `storage-diff.test.ts`: tag-boundary split and line diff. Pure, no I/O.
- Modify `packages/jira-client/src/client.ts`: export `authHeader` (one word change, so the new module reuses it).
- Modify `packages/jira-client/src/cli.ts` and `cli.test.ts`: new parser and four subcommands.
- Create `skills/confluence/SKILL.md`.

---

### Task 1: Shared helpers and `attach`

**Files:**
- Modify: `packages/jira-client/src/client.ts` (the `authHeader` function: add `export`)
- Create: `packages/jira-client/src/confluence.ts`
- Test: `packages/jira-client/src/confluence.test.ts`

**Interfaces:**
- Consumes: `Credentials`, `authHeader(creds): string` from `client.ts`.
- Produces (all exported from `confluence.ts`):
  - `class PageConflictError extends Error` (HTTP 409)
  - `wikiUrl(creds: Credentials, path: string): string` → `https://<site>/wiki<path>`
  - `confluenceFetch(url: string, init: RequestInit, opName: string): Promise<Response>`
  - `interface AttachResult { pageId: string; file: string; fileId: string; collection: string }`
  - `attachFile(pageId: string, filePath: string, creds: Credentials): Promise<AttachResult>`
  - `listAttachmentNames(pageId: string, creds: Credentials): Promise<string[]>`

- [ ] **Step 1: Write the failing tests** in `confluence.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PageConflictError,
  wikiUrl,
  confluenceFetch,
  attachFile,
  listAttachmentNames,
} from "./confluence.ts";

const creds = { email: "jack@example.com", token: "SECRET-TOKEN", site: "example.atlassian.net" };

afterEach(() => vi.unstubAllGlobals());

function stubFetch(...responses: Array<{ status?: number; json?: unknown; text?: string }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("wikiUrl", () => {
  it("prefixes the site and /wiki", () => {
    expect(wikiUrl(creds, "/rest/api/content/1")).toBe("https://example.atlassian.net/wiki/rest/api/content/1");
  });
});

describe("confluenceFetch", () => {
  it("throws PageConflictError on 409", async () => {
    stubFetch({ status: 409, text: "conflict" });
    await expect(confluenceFetch("https://x", {}, "op")).rejects.toBeInstanceOf(PageConflictError);
  });
  it("throws an error with op name and status on other failures, never the auth header", async () => {
    stubFetch({ status: 500, text: "boom" });
    const err = await confluenceFetch("https://x", { headers: { Authorization: "Basic SECRET" } }, "op").catch((e) => e);
    expect(String(err.message)).toBe("op failed: HTTP 500 boom");
    expect(String(err.message)).not.toContain("SECRET");
  });
});

describe("attachFile", () => {
  it("PUTs a multipart file with the nocheck header and returns fileId and collection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "confluence-test-"));
    const file = join(dir, "fig.png");
    writeFileSync(file, "png-bytes");
    const fn = stubFetch({
      json: { results: [{ extensions: { fileId: "abc-1", collectionName: "contentId-9" } }] },
    });
    const result = await attachFile("9", file, creds);
    expect(result).toEqual({ pageId: "9", file: "fig.png", fileId: "abc-1", collection: "contentId-9" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://example.atlassian.net/wiki/rest/api/content/9/child/attachment");
    expect(init.method).toBe("PUT");
    expect(init.headers["X-Atlassian-Token"]).toBe("nocheck");
    expect((init.body as FormData).get("minorEdit")).toBe("true");
    expect(((init.body as FormData).get("file") as File).name).toBe("fig.png");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("listAttachmentNames", () => {
  it("follows start/limit paging until a short page", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ title: `f${i}.png` }));
    const fn = stubFetch({ json: { results: page1 } }, { json: { results: [{ title: "last.png" }] } });
    const names = await listAttachmentNames("9", creds);
    expect(names).toHaveLength(201);
    expect(names[200]).toBe("last.png");
    expect(fn.mock.calls[1][0]).toContain("start=200");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/jira-client/src/confluence.test.ts`
Expected: FAIL, `./confluence.ts` not found.

- [ ] **Step 3: Implement.** In `client.ts` change `function authHeader` to `export function authHeader`. Create `confluence.ts`:

```ts
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { authHeader, type Credentials } from "./client.ts";

export class PageConflictError extends Error {}

export function wikiUrl(creds: Credentials, path: string): string {
  return `https://${creds.site}/wiki${path}`;
}

export async function confluenceFetch(url: string, init: RequestInit, opName: string): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 409) {
    throw new PageConflictError(`${opName} failed: the page changed since it was read (HTTP 409). Nothing was written. Read it again.`);
  }
  if (!res.ok) {
    throw new Error(`${opName} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res;
}

export interface AttachResult {
  pageId: string;
  file: string;
  fileId: string;
  collection: string;
}

export async function attachFile(pageId: string, filePath: string, creds: Credentials): Promise<AttachResult> {
  const name = basename(filePath);
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), name);
  form.append("minorEdit", "true");
  const res = await confluenceFetch(
    wikiUrl(creds, `/rest/api/content/${pageId}/child/attachment`),
    { method: "PUT", headers: { Authorization: authHeader(creds), "X-Atlassian-Token": "nocheck" }, body: form },
    "attachFile"
  );
  const body = (await res.json()) as { results: Array<{ extensions?: { fileId?: string; collectionName?: string } }> };
  const ext = body.results[0]?.extensions ?? {};
  return { pageId, file: name, fileId: ext.fileId ?? "", collection: ext.collectionName ?? "" };
}

const ATTACHMENT_PAGE_SIZE = 200;

export async function listAttachmentNames(pageId: string, creds: Credentials): Promise<string[]> {
  const names: string[] = [];
  for (let start = 0; ; start += ATTACHMENT_PAGE_SIZE) {
    const res = await confluenceFetch(
      wikiUrl(creds, `/rest/api/content/${pageId}/child/attachment?start=${start}&limit=${ATTACHMENT_PAGE_SIZE}`),
      { headers: { Authorization: authHeader(creds) } },
      "listAttachmentNames"
    );
    const body = (await res.json()) as { results: Array<{ title: string }> };
    names.push(...body.results.map((r) => r.title));
    if (body.results.length < ATTACHMENT_PAGE_SIZE) return names;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/jira-client`
Expected: PASS (new tests and the existing ones).

- [ ] **Step 5: Commit**

```bash
git add packages/jira-client/src/client.ts packages/jira-client/src/confluence.ts packages/jira-client/src/confluence.test.ts
git commit -m "feat(jira-client): add Confluence attach"
```

---

### Task 2: `place-images` logic

**Files:**
- Modify: `packages/jira-client/src/confluence.ts`
- Test: `packages/jira-client/src/confluence.test.ts`

**Interfaces:**
- Consumes: `confluenceFetch`, `wikiUrl`, `listAttachmentNames`, `authHeader`, `Credentials`.
- Produces:
  - `interface ImageMapping { placeholder: string; file: string; caption?: string }`
  - `parseMapping(raw: string): ImageMapping` — splits at the first `=`; after it, the file is the text up to the first `:`, the caption is the rest. Throws on a missing `=` or empty placeholder or file.
  - `escapeXml(text: string): string`
  - `countMarkers(body: string): number` — count of `<ac:inline-comment-marker`
  - `applyMappings(body: string, mappings: ImageMapping[], width: number): string` — throws if any placeholder appears zero or more than one time (message names the placeholder and the count), throws if the marker count changed.
  - `interface PlaceReport { pageId: string; version: number; markers: number; placed: Array<{ placeholder: string; file: string }>; written: boolean }`
  - `placeImages(pageId: string, mappings: ImageMapping[], opts: { width: number; apply: boolean }, creds: Credentials): Promise<PlaceReport>`

- [ ] **Step 1: Write the failing tests** (append to `confluence.test.ts`; add the new names to the import)

```ts
import { parseMapping, escapeXml, countMarkers, applyMappings, placeImages } from "./confluence.ts";

describe("parseMapping", () => {
  it("reads placeholder, file and caption", () => {
    expect(parseMapping("[FIG 1]=a.png:The first figure")).toEqual({ placeholder: "[FIG 1]", file: "a.png", caption: "The first figure" });
  });
  it("allows no caption", () => {
    expect(parseMapping("[FIG 1]=a.png")).toEqual({ placeholder: "[FIG 1]", file: "a.png", caption: undefined });
  });
  it("keeps a colon inside the caption", () => {
    expect(parseMapping("[F]=a.png:Step 1: do it").caption).toBe("Step 1: do it");
  });
  it("throws without an equals sign", () => {
    expect(() => parseMapping("nope")).toThrow(/placeholder=file/);
  });
});

describe("escapeXml", () => {
  it("escapes & < > and quotes", () => {
    expect(escapeXml(`a&b<c>"d"`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;");
  });
});

describe("applyMappings", () => {
  const body = `<p>Intro</p><p>[FIG 1]</p><p><ac:inline-comment-marker ac:ref="x">note</ac:inline-comment-marker></p>`;
  it("swaps the placeholder for an ac:image with width and caption", () => {
    const out = applyMappings(body, [{ placeholder: "[FIG 1]", file: "a&b.png", caption: "Cap <1>" }], 760);
    expect(out).toContain(
      `<ac:image ac:width="760"><ri:attachment ri:filename="a&amp;b.png" /><ac:caption>Cap &lt;1&gt;</ac:caption></ac:image>`
    );
    expect(out).not.toContain("[FIG 1]");
  });
  it("leaves out the caption element when there is no caption", () => {
    const out = applyMappings(body, [{ placeholder: "[FIG 1]", file: "a.png" }], 400);
    expect(out).toContain(`<ac:image ac:width="400"><ri:attachment ri:filename="a.png" /></ac:image>`);
  });
  it("throws when the placeholder is missing", () => {
    expect(() => applyMappings(body, [{ placeholder: "[FIG 9]", file: "a.png" }], 760)).toThrow(/\[FIG 9\].*0/);
  });
  it("throws when the placeholder appears twice", () => {
    expect(() => applyMappings("[X] [X]", [{ placeholder: "[X]", file: "a.png" }], 760)).toThrow(/\[X\].*2/);
  });
  it("throws when a placeholder sits inside a comment marker, so the marker count would change", () => {
    const risky = `<ac:inline-comment-marker ac:ref="x">[FIG 1]</ac:inline-comment-marker>`;
    expect(() => applyMappings(risky, [{ placeholder: `<ac:inline-comment-marker ac:ref="x">[FIG 1]`, file: "a.png" }], 760)).toThrow(/marker/);
  });
});

describe("placeImages", () => {
  const page = {
    id: "9", title: "T", version: { number: 4 },
    body: { storage: { value: "<p>[FIG 1]</p>" } },
  };
  const attachments = { results: [{ title: "a.png" }] };
  const map = [{ placeholder: "[FIG 1]", file: "a.png" }];

  it("dry run reads but never PUTs", async () => {
    const fn = stubFetch({ json: page }, { json: attachments });
    const report = await placeImages("9", map, { width: 760, apply: false }, creds);
    expect(report).toEqual({ pageId: "9", version: 4, markers: 0, placed: [{ placeholder: "[FIG 1]", file: "a.png" }], written: false });
    expect(fn.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("apply PUTs version + 1 with the new body", async () => {
    const fn = stubFetch({ json: page }, { json: attachments }, { json: {} });
    const report = await placeImages("9", map, { width: 760, apply: true }, creds);
    expect(report.written).toBe(true);
    const [url, init] = fn.mock.calls[2];
    expect(url).toBe("https://example.atlassian.net/wiki/rest/api/content/9");
    expect(init.method).toBe("PUT");
    const sent = JSON.parse(init.body as string);
    expect(sent.version.number).toBe(5);
    expect(sent.type).toBe("page");
    expect(sent.title).toBe("T");
    expect(sent.body.storage.representation).toBe("storage");
    expect(sent.body.storage.value).toContain("<ac:image");
  });

  it("a 409 on the PUT surfaces as PageConflictError and is not retried", async () => {
    const fn = stubFetch({ json: page }, { json: attachments }, { status: 409, text: "c" });
    await expect(placeImages("9", map, { width: 760, apply: true }, creds)).rejects.toBeInstanceOf(PageConflictError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails before any write when an attachment is missing on the page", async () => {
    const fn = stubFetch({ json: page }, { json: { results: [] } });
    await expect(placeImages("9", map, { width: 760, apply: true }, creds)).rejects.toThrow(/a\.png.*attach/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/jira-client/src/confluence.test.ts`
Expected: FAIL, names not exported.

- [ ] **Step 3: Implement** (append to `confluence.ts`)

```ts
export interface ImageMapping {
  placeholder: string;
  file: string;
  caption?: string;
}

export function parseMapping(raw: string): ImageMapping {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`bad --map "${raw}": expected placeholder=file[:caption]`);
  const placeholder = raw.slice(0, eq);
  const rest = raw.slice(eq + 1);
  const colon = rest.indexOf(":");
  const file = colon === -1 ? rest : rest.slice(0, colon);
  const caption = colon === -1 ? undefined : rest.slice(colon + 1);
  if (!file) throw new Error(`bad --map "${raw}": expected placeholder=file[:caption]`);
  return { placeholder, file, caption };
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARKER = "<ac:inline-comment-marker";

export function countMarkers(body: string): number {
  return body.split(MARKER).length - 1;
}

function imageXml(m: ImageMapping, width: number): string {
  const caption = m.caption ? `<ac:caption>${escapeXml(m.caption)}</ac:caption>` : "";
  return `<ac:image ac:width="${width}"><ri:attachment ri:filename="${escapeXml(m.file)}" />${caption}</ac:image>`;
}

export function applyMappings(body: string, mappings: ImageMapping[], width: number): string {
  let out = body;
  for (const m of mappings) {
    const count = out.split(m.placeholder).length - 1;
    if (count !== 1) {
      throw new Error(`placeholder "${m.placeholder}" appears ${count} times in the page; it must appear exactly once`);
    }
    out = out.replace(m.placeholder, () => imageXml(m, width));
  }
  if (countMarkers(out) !== countMarkers(body)) {
    throw new Error("the comment marker count would change; no write was made");
  }
  return out;
}

export interface PlaceReport {
  pageId: string;
  version: number;
  markers: number;
  placed: Array<{ placeholder: string; file: string }>;
  written: boolean;
}

interface PageRead {
  id: string;
  title: string;
  version: { number: number };
  body: { storage: { value: string } };
}

async function getPage(pageId: string, creds: Credentials): Promise<PageRead> {
  const res = await confluenceFetch(
    wikiUrl(creds, `/rest/api/content/${pageId}?expand=body.storage,version`),
    { headers: { Authorization: authHeader(creds) } },
    "getPage"
  );
  return (await res.json()) as PageRead;
}

export async function placeImages(
  pageId: string,
  mappings: ImageMapping[],
  opts: { width: number; apply: boolean },
  creds: Credentials
): Promise<PlaceReport> {
  const page = await getPage(pageId, creds);
  const before = page.body.storage.value;
  const after = applyMappings(before, mappings, opts.width);
  const onPage = new Set(await listAttachmentNames(pageId, creds));
  const missing = mappings.filter((m) => !onPage.has(m.file)).map((m) => m.file);
  if (missing.length > 0) {
    throw new Error(`not attached to page ${pageId}: ${missing.join(", ")}. Run attach first`);
  }
  const report: PlaceReport = {
    pageId,
    version: page.version.number,
    markers: countMarkers(before),
    placed: mappings.map((m) => ({ placeholder: m.placeholder, file: m.file })),
    written: false,
  };
  if (!opts.apply) return report;
  await confluenceFetch(
    wikiUrl(creds, `/rest/api/content/${pageId}`),
    {
      method: "PUT",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pageId,
        type: "page",
        title: page.title,
        version: { number: page.version.number + 1 },
        body: { storage: { value: after, representation: "storage" } },
      }),
    },
    "placeImages"
  );
  report.written = true;
  return report;
}
```

Note for the implementer: in the marker test the placeholder string includes the opening tag so the replace removes the marker; that is why the count check fires. Keep that test.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/jira-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jira-client/src/confluence.ts packages/jira-client/src/confluence.test.ts
git commit -m "feat(jira-client): add Confluence place-images"
```

---

### Task 3: `history` and `diff`

**Files:**
- Create: `packages/jira-client/src/storage-diff.ts`, `packages/jira-client/src/storage-diff.test.ts`
- Modify: `packages/jira-client/src/confluence.ts`, `confluence.test.ts`

**Interfaces:**
- Consumes: `confluenceFetch`, `wikiUrl`, `authHeader`.
- Produces:
  - `storage-diff.ts`: `splitStorage(body: string): string[]` (one token per tag or text run), `diffStorage(a: string, b: string): string` (lines prefixed `- `, `+ ` or two spaces; unchanged runs collapsed to `  ...` when more than 3 lines in a row).
  - `confluence.ts`: `interface VersionInfo { number: number; createdAt: string; authorId: string; message: string; autosaved: boolean }`, `listVersions(pageId, creds): Promise<VersionInfo[]>`, `getVersionBody(pageId, version, creds): Promise<string>`, `diffVersions(pageId, v1, v2, creds): Promise<string>`.

Assumption to confirm in the live check (Task 5): the v2 versions response marks an editor autosave in its `message` text. The code marks `autosaved` when `message` matches `/autosave/i`. If the live response differs, fix that one regex.

- [ ] **Step 1: Write the failing tests**

`storage-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitStorage, diffStorage } from "./storage-diff.ts";

describe("splitStorage", () => {
  it("splits at tag boundaries", () => {
    expect(splitStorage("<p>Hi <b>you</b></p>")).toEqual(["<p>", "Hi ", "<b>", "you", "</b>", "</p>"]);
  });
});

describe("diffStorage", () => {
  it("shows one changed word as one removed and one added line", () => {
    const out = diffStorage("<p>old word</p>", "<p>new word</p>");
    expect(out).toContain("- old word");
    expect(out).toContain("+ new word");
  });
  it("returns an empty string for equal input", () => {
    expect(diffStorage("<p>a</p>", "<p>a</p>")).toBe("");
  });
  it("collapses long unchanged runs", () => {
    const a = "<p>" + "<i>x</i>".repeat(6) + "a</p>";
    const b = "<p>" + "<i>x</i>".repeat(6) + "b</p>";
    expect(diffStorage(a, b)).toContain("  ...");
  });
});
```

Append to `confluence.test.ts` (add `listVersions, getVersionBody, diffVersions` to the import):

```ts
describe("listVersions", () => {
  it("maps the v2 response and flags autosaved versions", async () => {
    const fn = stubFetch({
      json: { results: [
        { number: 2, createdAt: "2026-10-16T10:00:00Z", authorId: "u1", message: "Autosaved" },
        { number: 1, createdAt: "2026-10-16T09:00:00Z", authorId: "u1", message: "" },
      ] },
    });
    const v = await listVersions("9", creds);
    expect(v[0]).toEqual({ number: 2, createdAt: "2026-10-16T10:00:00Z", authorId: "u1", message: "Autosaved", autosaved: true });
    expect(v[1].autosaved).toBe(false);
    expect(fn.mock.calls[0][0]).toBe("https://example.atlassian.net/wiki/api/v2/pages/9/versions?limit=250");
  });
});

describe("diffVersions", () => {
  it("reads both historical bodies and diffs them", async () => {
    const fn = stubFetch(
      { json: { body: { storage: { value: "<p>old</p>" } } } },
      { json: { body: { storage: { value: "<p>new</p>" } } } }
    );
    const out = await diffVersions("9", 1, 2, creds);
    expect(out).toContain("- old");
    expect(out).toContain("+ new");
    expect(fn.mock.calls[0][0]).toBe("https://example.atlassian.net/wiki/rest/api/content/9?status=historical&version=1&expand=body.storage");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/jira-client`
Expected: FAIL on the new files and names.

- [ ] **Step 3: Implement.** `storage-diff.ts`:

```ts
export function splitStorage(body: string): string[] {
  return body.match(/<[^>]*>|[^<]+/g) ?? [];
}

const CONTEXT_COLLAPSE = 3;

export function diffStorage(a: string, b: string): string {
  const x = splitStorage(a);
  const y = splitStorage(b);
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      lines.push(`  ${x[i]}`);
      i++;
      j++;
    } else if (j < y.length && (i === x.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      lines.push(`+ ${y[j++]}`);
    } else {
      lines.push(`- ${x[i++]}`);
    }
  }
  if (!lines.some((l) => l.startsWith("+ ") || l.startsWith("- "))) return "";
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > CONTEXT_COLLAPSE) out.push("  ...");
    else out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (line.startsWith("  ")) run.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}
```

Append to `confluence.ts` (add `import { diffStorage } from "./storage-diff.ts";` at the top):

```ts
export interface VersionInfo {
  number: number;
  createdAt: string;
  authorId: string;
  message: string;
  autosaved: boolean;
}

export async function listVersions(pageId: string, creds: Credentials): Promise<VersionInfo[]> {
  const res = await confluenceFetch(
    wikiUrl(creds, `/api/v2/pages/${pageId}/versions?limit=250`),
    { headers: { Authorization: authHeader(creds) } },
    "listVersions"
  );
  const body = (await res.json()) as {
    results: Array<{ number: number; createdAt: string; authorId: string; message?: string }>;
  };
  return body.results.map((r) => ({
    number: r.number,
    createdAt: r.createdAt,
    authorId: r.authorId,
    message: r.message ?? "",
    autosaved: /autosave/i.test(r.message ?? ""),
  }));
}

export async function getVersionBody(pageId: string, version: number, creds: Credentials): Promise<string> {
  const res = await confluenceFetch(
    wikiUrl(creds, `/rest/api/content/${pageId}?status=historical&version=${version}&expand=body.storage`),
    { headers: { Authorization: authHeader(creds) } },
    "getVersionBody"
  );
  const body = (await res.json()) as { body: { storage: { value: string } } };
  return body.body.storage.value;
}

export async function diffVersions(pageId: string, v1: number, v2: number, creds: Credentials): Promise<string> {
  const [a, b] = [await getVersionBody(pageId, v1, creds), await getVersionBody(pageId, v2, creds)];
  return diffStorage(a, b);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/jira-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jira-client/src/storage-diff.ts packages/jira-client/src/storage-diff.test.ts packages/jira-client/src/confluence.ts packages/jira-client/src/confluence.test.ts
git commit -m "feat(jira-client): add Confluence history and diff"
```

---

### Task 4: CLI wiring

**Files:**
- Modify: `packages/jira-client/src/cli.ts`
- Test: `packages/jira-client/src/cli.test.ts`

**Interfaces:**
- Consumes: from `confluence.ts`: `attachFile`, `placeImages`, `parseMapping`, `listVersions`, `diffVersions`, `PageConflictError`; from `client.ts`: `checkCredentials`.
- Produces: `parseConfluenceArgs(argv: string[]): { positionals: string[]; flags: Record<string, string>; maps: string[]; apply: boolean }` — `--apply` is boolean; `--map` may repeat and collects every value; other `--name value` pairs go to `flags`; anything else is positional. Subcommands `attach`, `place-images`, `history`, `diff`.

CLI contract:
- `attach <pageId> <files...> [--apply]` → stdout one tab-separated line per file: `pageId file fileId collection`. Without `--apply`: stdout `dry run: would attach <file> to page <pageId>` per file, no request.
- `place-images <pageId> --map "<p>=<f>[:c]" ... [--width N] [--apply]` → stdout a report: `page <id> version <n> markers <m>`, one line `place <placeholder> -> <file>` per mapping, then `written: yes` or `dry run: nothing written`.
- `history <pageId>` → one tab-separated line per version: `number createdAt authorId autosaved|manual message`.
- `diff <pageId> <v1> <v2>` → the diff text, or `no differences`.

- [ ] **Step 1: Write the failing tests** (append to `cli.test.ts`; add `parseConfluenceArgs` to the import)

```ts
describe("parseConfluenceArgs", () => {
  it("splits positionals, repeated --map, boolean --apply and value flags", () => {
    expect(
      parseConfluenceArgs(["123", "a.png", "b.png", "--apply", "--map", "[A]=a.png", "--map", "[B]=b.png:Cap", "--width", "500"])
    ).toEqual({
      positionals: ["123", "a.png", "b.png"],
      flags: { width: "500" },
      maps: ["[A]=a.png", "[B]=b.png:Cap"],
      apply: true,
    });
  });
  it("defaults apply to false", () => {
    expect(parseConfluenceArgs(["123"]).apply).toBe(false);
  });
});

describe("confluence subcommands", () => {
  it("attach without a page id exits 1 with a plain line", () => {
    const r = spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, "attach"], { encoding: "utf-8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/page id/);
  });
  it("place-images without --map exits 1", () => {
    const r = spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, "place-images", "123"], { encoding: "utf-8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--map/);
  });
});
```

(Check on `cli.test.ts` how the existing spawn tests set up a credentials file or `HOME`; the two tests above fail on missing arguments before credentials are read, so they need none. Keep the argument check before `checkCredentials()` in every new case.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/jira-client/src/cli.test.ts`
Expected: FAIL, `parseConfluenceArgs` not exported.

- [ ] **Step 3: Implement.** In `cli.ts` add the imports and:

```ts
export function parseConfluenceArgs(argv: string[]): {
  positionals: string[];
  flags: Record<string, string>;
  maps: string[];
  apply: boolean;
} {
  const out = { positionals: [] as string[], flags: {} as Record<string, string>, maps: [] as string[], apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--map") out.maps.push(argv[++i]);
    else if (a.startsWith("--")) out.flags[a.slice(2)] = argv[++i];
    else out.positionals.push(a);
  }
  return out;
}
```

New switch cases (each checks its arguments first, then `checkCredentials()`):

```ts
case "attach": {
  const c = parseConfluenceArgs(rest);
  const [pageId, ...files] = c.positionals;
  if (!pageId || files.length === 0) throw new Error("usage: attach <page id> <files...> [--apply]");
  const creds = checkCredentials();
  for (const file of files) {
    if (!c.apply) {
      console.log(`dry run: would attach ${file} to page ${pageId}`);
      continue;
    }
    const r = await attachFile(pageId, file, creds);
    console.log([r.pageId, r.file, r.fileId, r.collection].join("\t"));
  }
  break;
}
case "place-images": {
  const c = parseConfluenceArgs(rest);
  const [pageId] = c.positionals;
  if (!pageId) throw new Error("usage: place-images <page id> --map <placeholder>=<file>[:caption] [--width N] [--apply]");
  if (c.maps.length === 0) throw new Error("missing required flag: --map");
  const creds = checkCredentials();
  const report = await placeImages(pageId, c.maps.map(parseMapping), { width: Number(c.flags.width ?? 760), apply: c.apply }, creds);
  console.log(`page ${report.pageId} version ${report.version} markers ${report.markers}`);
  for (const p of report.placed) console.log(`place ${p.placeholder} -> ${p.file}`);
  console.log(report.written ? "written: yes" : "dry run: nothing written");
  break;
}
case "history": {
  const [pageId] = parseConfluenceArgs(rest).positionals;
  if (!pageId) throw new Error("usage: history <page id>");
  const creds = checkCredentials();
  for (const v of await listVersions(pageId, creds)) {
    console.log([v.number, v.createdAt, v.authorId, v.autosaved ? "autosaved" : "manual", v.message].join("\t"));
  }
  break;
}
case "diff": {
  const [pageId, v1, v2] = parseConfluenceArgs(rest).positionals;
  if (!pageId || !v1 || !v2) throw new Error("usage: diff <page id> <version 1> <version 2>");
  const creds = checkCredentials();
  console.log((await diffVersions(pageId, Number(v1), Number(v2), creds)) || "no differences");
  break;
}
```

Note: the existing `main` runs `parseArgs(rest)` before the switch, and that is harmless for these commands. The existing catch block prints `failed: <message>`; a `PageConflictError` message already says "Nothing was written", so no new catch branch is needed. The usage text goes to stderr through the same catch. The tests above expect "page id" and "--map" in stderr, which the messages contain.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/jira-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jira-client/src/cli.ts packages/jira-client/src/cli.test.ts
git commit -m "feat(jira-client): wire the Confluence commands into the CLI"
```

---

### Task 5: The `digismith:confluence` skill and the live check

**Files:**
- Create: `skills/confluence/SKILL.md`

**Interfaces:**
- Consumes: the four CLI commands from Task 4, called as `node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts <command>` (the same path the Jira skills use).
- Produces: the skill.

- [ ] **Step 1: Write `skills/confluence/SKILL.md`.** Frontmatter: `name: confluence`; `description: Use when a Confluence page needs files attached, images placed inline, or its version history read or diffed — runs the jira-client Confluence commands with a dry run and Jack's approval before any write.` Body, in the style of `skills/jira-progress-write-back/SKILL.md` (Overview, When to Use, The Commands, The Flow, Rules). Content to cover:
  - Overview: why REST (the MCP cannot attach; a full-body update resends 40 to 60 KB and can overwrite an open editor).
  - The four commands with the exact CLI contract from Task 4.
  - The flow: (1) `check-credentials`; (2) generate the figures; (3) dry run `attach`, show Jack the list; (4) after his yes, `attach --apply`; (5) dry run `place-images`, show Jack the placeholders and version; (6) after his yes, `place-images --apply`; (7) on a 409, read the page again with `history` and `diff`, tell Jack what changed, and start again from step 5 with a new dry run.
  - Rules: every `--apply` needs Jack's explicit yes for that run; never print or read `.env`; never skip the dry run; the image width default is 760; if the marker count changes the command refuses, never work around it; use the Atlassian MCP for text edits and comments, this skill only for what it cannot do.
  - Out of scope: section edits (a later ticket).

- [ ] **Step 2: Run the whole suite**

Run: `pnpm vitest run`
Expected: PASS, no new failures anywhere.

- [ ] **Step 3: Commit**

```bash
git add skills/confluence/SKILL.md
git commit -m "feat(skills): add the confluence skill"
```

- [ ] **Step 4: Live check (only when Jack orders it, on a scratch page he names).** Run `history <pageId>` (read only; confirm what an autosaved version looks like and fix the `/autosave/i` test in `listVersions` if the live data differs). Then, with Jack's yes at each write: `attach <pageId> <one.png> --apply`, then `place-images <pageId> --map "<placeholder>=<one.png>" --apply`, then `diff <pageId> <v1> <v2>` and read the page in the browser. Record the result in the report. This step is not part of the build's pass criteria; the mocked tests are.

---

## Self-review (spec coverage)

- 4.1 attach: Task 1 (request shape, one by one) and Task 4 (stops on first failure: the `for` loop throws, so remaining files are not sent; files done before it have already printed).
- 4.2 place-images: Task 2 (exactly-once, escaping, width, marker check, version + 1, 409 no retry, attachment present) and Task 4 (flags).
- 4.3 history and diff: Task 3 and Task 4.
- 4.4 errors and exit codes: existing `main` catch, Task 4.
- D1 home, D2 no `dg` group, D3 skill: Tasks 1 to 5. D4 credentials: reuse of `checkCredentials`; `confluenceFetch` errors carry status and body only (tested). D5 dry run: Tasks 2 and 4.
- Testing (spec section 5): mocked unit tests in Tasks 1 to 4; live check Task 5 step 4.
- Type names checked across tasks: `ImageMapping`, `PlaceReport`, `VersionInfo`, `AttachResult`, `PageConflictError`, `confluenceFetch`, `wikiUrl`, `parseMapping`, `applyMappings`, `placeImages`, `listVersions`, `diffVersions`, `parseConfluenceArgs`.

## Definition of Ready

Checked 2026-10-26 (UTC+7).

| Item | State |
|---|---|
| Spec | Done, approved by Jack 2026-10-26 (through the conductor). |
| Plan | Done: 5 tasks, mocked tests, no new dependency. Checklist sync skipped on purpose (docs only, nothing built yet; run `dg clickup checklist sync` when the build starts). |
| Milestone | Proposed: after Dawn (V1.1). The helper serves the Confluence doc-update flow, not the Dawn (V1) path. Not set by me; the conductor or Jack sets it. |
| Blockers | None. No dependency on another ticket. The lineage move to "D.x Atlassian Channel" is a separate step and does not block the build, because the code path is `packages/jira-client` either way. |
| Mode | Manual. Confirmed from the pitch. Reason: only the live check (Task 5 step 4) needs a real Confluence page and Jack present; but the Builder cannot do it unattended, and the factory must not claim a ticket whose last step needs Jack. |
| Sign-off | Auto. Confirmed. The contract is fully defined: commands, flags, outputs, checks. No look, wording or business choice is left to judge. The one human gate (every page write) is built into the tool and the skill. |
| Risks to watch | (1) The `autosaved` flag rests on one assumption about the v2 response; Task 5 step 4 confirms it. (2) A placeholder that crosses an XML tag cannot match as plain text; it fails loudly with the count, never silently. |
