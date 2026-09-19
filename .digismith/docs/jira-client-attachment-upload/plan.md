# Jira Client Attachment Upload (I.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attachment-upload capability to `packages/jira-client`, including a best-effort Media Platform UUID discovery for future inline-image use, without touching any template or consumer skill.

**Architecture:** One new function, `uploadAttachment`, in `client.ts` (classic REST multipart upload + a graceful-fallback UUID lookup via an internal helper), plus one new CLI subcommand wrapping it — same shape every existing operation in this file already follows.

**Tech Stack:** TypeScript (Node ≥24 native globals — `fetch`, `FormData`, `Blob` — no library), Vitest, mocked `fetch` per test.

## Global Constraints

- No new dependencies — native `fetch`/`FormData`/`Blob` only, matching every existing function in `client.ts`.
- The upload itself must throw on failure (like every other write op here); only the Media Platform UUID lookup is allowed to fail silently (return `undefined`, never throw) — this is the graceful-fallback decision from the design.
- Out of scope, do not touch: the Progress Update template's Screenshots/Videos section, `generate-comment`, `jira-progress-write-back`, or anything that actually posts a `mediaSingle`/`media` ADF node. This plan only adds the capability to `packages/jira-client`.

---

### Task 1: Add `uploadAttachment` to client.ts and wire the CLI subcommand

**Files:**
- Modify: `packages/jira-client/src/client.ts`
- Modify: `packages/jira-client/src/cli.ts`
- Modify: `packages/jira-client/src/client.test.ts` (add a new `describe` block; every existing block untouched)

**Interfaces:**
- Consumes: `Credentials`, `CredentialsError`, `baseUrl`, `authHeader`, `jiraFetch` — all already defined in `client.ts`; `checkCredentials`, `requireArgs` — already defined/imported in `cli.ts`.
- Produces: `export interface AttachmentUploadResult { id: string; filename: string; contentUrl: string; mediaId?: string }` and `export async function uploadAttachment(key: string, filePath: string, creds: Credentials): Promise<AttachmentUploadResult>` — terminal for this plan, no later task consumes these.

- [ ] **Step 1: Write the four failing tests**

Add to `packages/jira-client/src/client.test.ts`, first adding `uploadAttachment` to the existing import from `./client.ts` (keep every other import and existing `describe` block exactly as they are):

```ts
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getComments,
  getAttachmentContent,
  uploadAttachment,
} from "./client.ts";
```

Then add this new `describe` block anywhere after the existing `CREDS` constant is declared (it reuses `CREDS` and the file's existing `makeHeaders` helper, both already defined above the `getAttachmentContent` block):

```ts
describe("uploadAttachment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads via multipart POST and returns id/filename/contentUrl plus mediaId on a matching redirect", async () => {
    const uploadResponse = {
      ok: true,
      json: () => Promise.resolve([{ id: "10001", filename: "screenshot.png" }]),
    };
    const redirectResponse = {
      status: 303,
      headers: makeHeaders({
        location: "https://api.media.atlassian.com/file/abc-123-uuid/binary?token=xyz",
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(uploadResponse)
      .mockResolvedValueOnce(redirectResponse);
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-upload-"));
    const filePath = join(tmpDir, "screenshot.png");
    writeFileSync(filePath, Buffer.from([1, 2, 3]));

    const result = await uploadAttachment("EMKT-1", filePath, CREDS);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/attachments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Atlassian-Token": "no-check" }),
      })
    );
    const firstCallInit = fetchMock.mock.calls[0][1];
    expect(firstCallInit.body).toBeInstanceOf(FormData);

    expect(result).toEqual({
      id: "10001",
      filename: "screenshot.png",
      contentUrl: "https://example.atlassian.net/rest/api/3/attachment/content/10001",
      mediaId: "abc-123-uuid",
    });

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("omits mediaId when the redirect Location doesn't match the expected Media Platform URL shape", async () => {
    const uploadResponse = {
      ok: true,
      json: () => Promise.resolve([{ id: "10002", filename: "shot.png" }]),
    };
    const redirectResponse = {
      status: 303,
      headers: makeHeaders({
        location: "https://example.atlassian.net/secure/attachment/10002/shot.png",
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(uploadResponse)
      .mockResolvedValueOnce(redirectResponse);
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-upload-"));
    const filePath = join(tmpDir, "shot.png");
    writeFileSync(filePath, Buffer.from([1]));

    const result = await uploadAttachment("EMKT-1", filePath, CREDS);

    expect(result.mediaId).toBeUndefined();
    expect(result.id).toBe("10002");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("omits mediaId when the content-URL lookup returns a non-redirect response", async () => {
    const uploadResponse = {
      ok: true,
      json: () => Promise.resolve([{ id: "10003", filename: "shot2.png" }]),
    };
    const nonRedirectResponse = { status: 200, headers: makeHeaders({}) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(uploadResponse)
      .mockResolvedValueOnce(nonRedirectResponse);
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-upload-"));
    const filePath = join(tmpDir, "shot2.png");
    writeFileSync(filePath, Buffer.from([1]));

    const result = await uploadAttachment("EMKT-1", filePath, CREDS);

    expect(result.mediaId).toBeUndefined();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the upload itself fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      text: () => Promise.resolve("payload too large"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-upload-"));
    const filePath = join(tmpDir, "big.png");
    writeFileSync(filePath, Buffer.from([1]));

    await expect(uploadAttachment("EMKT-1", filePath, CREDS)).rejects.toThrow(/413/);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they currently fail**

Run: `pnpm test -- packages/jira-client/src/client.test.ts`

Expected: all four new tests **FAIL** with an error naming `uploadAttachment` as not exported/not a function — it doesn't exist yet. Every pre-existing test in this file still passes.

- [ ] **Step 3: Implement `uploadAttachment` and its Media Platform UUID helper**

In `packages/jira-client/src/client.ts`, add `basename` to the existing `node:path`... there is no existing `node:path` import in this file — add a new one. At the top of the file, change:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
```

to:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
```

Then append this at the end of the file, after `getAttachmentContent`:

```ts
const MEDIA_PLATFORM_ID_PATTERN = /api\.media\.atlassian\.com\/file\/([^/]+)\/binary/;

async function tryGetMediaPlatformId(
  attachmentId: string,
  creds: Credentials
): Promise<string | undefined> {
  const url = `${baseUrl(creds)}/attachment/content/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(creds) },
    redirect: "manual",
  });
  if (res.status < 300 || res.status >= 400) return undefined;
  const location = res.headers.get("location");
  if (!location) return undefined;
  const match = location.match(MEDIA_PLATFORM_ID_PATTERN);
  return match ? match[1] : undefined;
}

export interface AttachmentUploadResult {
  id: string;
  filename: string;
  contentUrl: string;
  mediaId?: string;
}

export async function uploadAttachment(
  key: string,
  filePath: string,
  creds: Credentials
): Promise<AttachmentUploadResult> {
  const fileBytes = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBytes]), basename(filePath));
  const url = `${baseUrl(creds)}/issue/${key}/attachments`;
  const res = await jiraFetch(
    url,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(creds),
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    },
    "uploadAttachment"
  );
  const attachments = (await res.json()) as Array<{ id: string; filename: string }>;
  const attachment = attachments[0];
  const contentUrl = `${baseUrl(creds)}/attachment/content/${attachment.id}`;
  const mediaId = await tryGetMediaPlatformId(attachment.id, creds);
  return { id: attachment.id, filename: attachment.filename, contentUrl, mediaId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- packages/jira-client/src/client.test.ts`

Expected: all tests pass, including the four new ones.

- [ ] **Step 5: Add the CLI subcommand**

In `packages/jira-client/src/cli.ts`, add `uploadAttachment` to the existing import from `./client.ts`:

```ts
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getComments,
  getAttachmentContent,
  uploadAttachment,
} from "./client.ts";
```

Then add a new `case` in the `switch (subcommand)` block, right after the existing `"get-attachment"` case:

```ts
case "upload-attachment": {
  requireArgs(args, ["key", "file"]);
  const creds = checkCredentials();
  const result = await uploadAttachment(args.key, args.file, creds);
  console.log(JSON.stringify(result));
  break;
}
```

- [ ] **Step 6: Run the full jira-client test suite to verify nothing else broke**

Run: `pnpm test -- packages/jira-client/src`

Expected: all tests pass, across `client.test.ts`, `cli.test.ts`, and `markdown-to-adf.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/jira-client/src/client.ts packages/jira-client/src/cli.ts packages/jira-client/src/client.test.ts
git commit -m "feat(jira-client): add attachment-upload subcommand with best-effort inline-media UUID discovery"
```

## Self-Check Before Finishing

- [ ] The upload itself throws on failure; only the Media Platform UUID lookup ever silently returns `undefined` — never the reverse.
- [ ] No template, `generate-comment`, or `jira-progress-write-back` changes anywhere in this plan — that's explicitly out of scope.
- [ ] `pnpm test -- packages/jira-client/src` passes in full, including every pre-existing test.
