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

describe("getAttachmentContent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads bytes, writes them to outPath, and returns outPath", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-attach-"));
    const outPath = join(tmpDir, "screenshot.png");

    const result = await getAttachmentContent("att-1", outPath, CREDS);

    expect(result).toBe(outPath);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/attachment/content/att-1",
      expect.objectContaining({ redirect: "follow" })
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("not found"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttachmentContent("att-x", "/tmp/x", CREDS)).rejects.toThrow(/404/);
  });
});
