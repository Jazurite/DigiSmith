import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setVoice } from "./voice.ts";
import voiceInit, { conversationDigest, readRuleTitles } from "./voice-init.ts";

describe("voiceInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns both axis names joined when no preferences file exists (both default on)", async () => {
    await expect(voiceInit()).resolves.toBe("technical+conversation");
  });

  it("returns only the on axis when one is turned off", async () => {
    setVoice("technical", "off", ".digismith");
    await expect(voiceInit()).resolves.toBe("conversation");
  });

  it("returns null when both axes are off", async () => {
    setVoice("technical", "off", ".digismith");
    setVoice("conversation", "off", ".digismith");
    await expect(voiceInit()).resolves.toBeNull();
  });
});

const FIXTURE_STANDARD =
  "# Title\n\n## Rules\n\n### 1. Lead with the next action\n\ntext\n\n### 2. Number multi-step tasks\n\ntext\n\n## When to break the rules\n\n### 1. Not a rule title\n";

describe("readRuleTitles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-rule-titles-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the numbered headings under ## Rules only", () => {
    const file = path.join(tmpDir, "standard.md");
    fs.writeFileSync(file, FIXTURE_STANDARD);
    expect(readRuleTitles(file)).toEqual(["1. Lead with the next action", "2. Number multi-step tasks"]);
  });

  it("returns an empty list when the file does not exist", () => {
    expect(readRuleTitles(path.join(tmpDir, "missing.md"))).toEqual([]);
  });

  it("finds all 11 rules in the real standard", () => {
    const real = path.resolve(import.meta.dirname, "..", "standards", "global", "ai-voice-conversational.md");
    expect(readRuleTitles(real)).toHaveLength(11);
  });
});

describe("conversationDigest", () => {
  let tmpDir: string;
  let originalCwd: string;
  let standard: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-digest-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    standard = path.join(tmpDir, "standard.md");
    fs.writeFileSync(standard, FIXTURE_STANDARD);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists the titles and the standard path when the conversation voice is on", async () => {
    const line = await conversationDigest(standard);
    expect(line).toContain("1. Lead with the next action; 2. Number multi-step tasks");
    expect(line).toContain(path.resolve(standard));
  });

  it("returns null when the conversation voice is off", async () => {
    setVoice("conversation", "off", ".digismith");
    await expect(conversationDigest(standard)).resolves.toBeNull();
  });

  it("still prints when only the technical voice is off", async () => {
    setVoice("technical", "off", ".digismith");
    await expect(conversationDigest(standard)).resolves.toContain("1. Lead with the next action");
  });

  it("returns null when the standard file is missing", async () => {
    await expect(conversationDigest(path.join(tmpDir, "missing.md"))).resolves.toBeNull();
  });
});
