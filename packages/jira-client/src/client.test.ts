import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getComments,
  getAttachmentContent,
} from "./client.ts";

describe("checkCredentials", () => {
  it("returns credentials when the env file has all three values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "JIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );
    const creds = checkCredentials(envPath);
    expect(creds).toEqual({
      email: "jack@example.com",
      token: "abc123",
      site: "example.atlassian.net",
    });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when the file doesn't exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, "missing.env");
    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when a required key is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "JIRA_EMAIL=jack@example.com\nJIRA_SITE=example.atlassian.net\n"
    );
    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores comment lines and blank lines", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "# a comment\n\nJIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );
    const creds = checkCredentials(envPath);
    expect(creds.email).toBe("jack@example.com");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips a pasted scheme and trailing slash from JIRA_SITE", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "JIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=https://example.atlassian.net/\n"
    );
    const creds = checkCredentials(envPath);
    expect(creds.site).toBe("example.atlassian.net");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips surrounding quotes from a dotenv-style quoted value", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      'JIRA_EMAIL="jack@example.com"\nJIRA_API_TOKEN="abc123"\nJIRA_SITE=example.atlassian.net\n'
    );
    const creds = checkCredentials(envPath);
    expect(creds).toEqual({
      email: "jack@example.com",
      token: "abc123",
      site: "example.atlassian.net",
    });
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

const CREDS: import("./client.ts").Credentials = {
  email: "jack@example.com",
  token: "abc123",
  site: "example.atlassian.net",
};

describe("getIssue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the correct URL with Basic auth and returns parsed JSON", async () => {
    const mockJson = { fields: { summary: "Test issue" } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getIssue("EMKT-1", ["summary", "description"], CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1?fields=summary,description",
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from("jack@example.com:abc123").toString("base64"),
        },
      }
    );
    expect(result).toEqual(mockJson);
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Issue not found"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getIssue("EMKT-999", ["summary"], CREDS)).rejects.toThrow(/404/);
  });
});

describe("updateDescription", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs the description field wrapped in fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    await updateDescription("EMKT-1", adfDoc, CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ fields: { description: adfDoc } }),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("bad request"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateDescription("EMKT-1", {}, CREDS)).rejects.toThrow(/400/);
  });
});

describe("addComment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs a new comment when no commentId is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    const result = await addComment("EMKT-1", adfDoc, CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: adfDoc }) })
    );
    expect(result).toEqual({ id: "123" });
  });

  it("PUTs to the existing comment when commentId is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "456" }) });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    await addComment("EMKT-1", adfDoc, CREDS, "456");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment/456",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ body: adfDoc }) })
    );
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("forbidden"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(addComment("EMKT-1", {}, CREDS)).rejects.toThrow(/403/);
  });
});

describe("getComments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns all comments when they fit in a single page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: "1", body: {} }, { id: "2", body: {} }],
          total: 2,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getComments("EMKT-1", CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment?startAt=0&maxResults=100",
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "1", body: {} }, { id: "2", body: {} }]);
  });

  it("follows startAt across multiple pages until total is reached", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ comments: [{ id: "1", body: {} }, { id: "2", body: {} }], total: 3 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ comments: [{ id: "3", body: {} }], total: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getComments("EMKT-1", CREDS);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment?startAt=0&maxResults=100",
      expect.anything()
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment?startAt=2&maxResults=100",
      expect.anything()
    );
    expect(result.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("throws when a page response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("server error"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getComments("EMKT-1", CREDS)).rejects.toThrow(/500/);
  });
});

function makeHeaders(map: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

describe("getAttachmentContent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads bytes, writes them to outPath, and returns outPath", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders({}),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-attach-"));
    const outPath = join(tmpDir, "screenshot.png");

    const result = await getAttachmentContent("att-1", outPath, CREDS);

    expect(result).toBe(outPath);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/attachment/content/att-1",
      expect.objectContaining({ redirect: "manual" })
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: makeHeaders({}),
      text: () => Promise.resolve("not found"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttachmentContent("att-x", "/tmp/x", CREDS)).rejects.toThrow(/404/);
  });

  it("re-attaches Authorization when a redirect stays on the same origin", async () => {
    const bytes = new Uint8Array([9]);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: makeHeaders({ location: "https://example.atlassian.net/secure/att-1/file.png" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders({}),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-attach-"));
    const outPath = join(tmpDir, "file.png");
    await getAttachmentContent("att-1", outPath, CREDS);

    const secondCallHeaders = fetchMock.mock.calls[1][1].headers;
    expect(secondCallHeaders.Authorization).toBeDefined();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("drops Authorization when a redirect crosses to a different origin", async () => {
    const bytes = new Uint8Array([9]);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: makeHeaders({ location: "https://media.example-cdn.net/files/att-1" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders({}),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-attach-"));
    const outPath = join(tmpDir, "file.png");
    await getAttachmentContent("att-1", outPath, CREDS);

    const secondCallHeaders = fetchMock.mock.calls[1][1].headers;
    expect(secondCallHeaders.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe("https://media.example-cdn.net/files/att-1");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws after too many redirects", async () => {
    let hop = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      hop++;
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: makeHeaders({ location: `https://example.atlassian.net/hop-${hop}` }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttachmentContent("att-1", "/tmp/x", CREDS)).rejects.toThrow(/too many redirects/);
  });
});
