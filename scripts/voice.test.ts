import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AXES,
  isAxis,
  standardForAxis,
  resolveVoice,
  resolveAllVoices,
  setVoice,
  main,
} from "./voice.ts";

function writeConfig(dir: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.yml"), `preferences:\n${body}`);
}

describe("AXES / isAxis", () => {
  it("lists exactly the two known axes", () => {
    expect(AXES).toEqual(["technical", "conversation"]);
  });

  it("accepts only the two known axes", () => {
    expect(isAxis("technical")).toBe(true);
    expect(isAxis("conversation")).toBe(true);
    expect(isAxis("emotional")).toBe(false);
    expect(isAxis("")).toBe(false);
  });
});

describe("standardForAxis", () => {
  it("maps technical to ste100-writing", () => {
    expect(standardForAxis("technical")).toBe("global/ste100-writing");
  });

  it("maps conversation to ai-voice-conversational", () => {
    expect(standardForAxis("conversation")).toBe("global/ai-voice-conversational");
  });
});

describe("resolveVoice / resolveAllVoices", () => {
  let tmpDir: string;
  let dir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    dir = path.join(tmpDir, ".digismith");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults both axes to on when the file doesn't exist", () => {
    expect(resolveVoice("technical", dir)).toBe("on");
    expect(resolveVoice("conversation", dir)).toBe("on");
    expect(resolveAllVoices(dir)).toEqual({ technical: "on", conversation: "on" });
  });

  it("reads an explicit off", () => {
    writeConfig(dir, "  technical_voice: off\n");
    expect(resolveVoice("technical", dir)).toBe("off");
    expect(resolveVoice("conversation", dir)).toBe("on");
  });

  it("reads an explicit on", () => {
    writeConfig(dir, "  conversation_voice: on\n");
    expect(resolveVoice("conversation", dir)).toBe("on");
  });

  it("treats any value other than the literal off as on", () => {
    writeConfig(dir, "  technical_voice: maybe\n");
    expect(resolveVoice("technical", dir)).toBe("on");
  });

  it("keeps the two axes independent", () => {
    writeConfig(dir, "  technical_voice: off\n  conversation_voice: off\n");
    expect(resolveAllVoices(dir)).toEqual({ technical: "off", conversation: "off" });
  });

  it("still reads an old flat preferences.yml", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "preferences.yml"), "technical_voice: off\n");
    expect(resolveVoice("technical", dir)).toBe("off");
  });
});

describe("setVoice", () => {
  let tmpDir: string;
  let dir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    dir = path.join(tmpDir, ".digismith");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes technical_voice under its own preference key", () => {
    setVoice("technical", "off", dir);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toContain("technical_voice: off");
  });

  it("writes conversation_voice under its own preference key, independently", () => {
    setVoice("technical", "off", dir);
    setVoice("conversation", "off", dir);
    const content = fs.readFileSync(path.join(dir, "config.yml"), "utf8");
    expect(content).toContain("technical_voice: off");
    expect(content).toContain("conversation_voice: off");
  });

  it("round-trips through resolveVoice", () => {
    setVoice("conversation", "off", dir);
    expect(resolveVoice("conversation", dir)).toBe("off");
    setVoice("conversation", "on", dir);
    expect(resolveVoice("conversation", dir)).toBe("on");
  });
});

describe("main (CLI)", () => {
  let tmpDir: string;
  let dir: string;
  let originalArgv: string[];
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    dir = path.join(tmpDir, ".digismith");
    originalArgv = process.argv;
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (msg: string) => logs.push(msg);
    console.error = (msg: string) => errors.push(msg);
  });

  afterEach(() => {
    process.argv = originalArgv;
    console.log = originalLog;
    console.error = originalError;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("status prints both axes as on by default", () => {
    process.argv = ["node", "voice.ts", "--action", "status", "--dir", dir];
    main();
    expect(logs).toEqual([
      "technical-voice: ON (global/ste100-writing)",
      "conversation-voice: ON (global/ai-voice-conversational)",
    ]);
  });

  it("status reflects an off axis with no standard name", () => {
    writeConfig(dir, "  technical_voice: off\n");
    process.argv = ["node", "voice.ts", "--action", "status", "--dir", dir];
    main();
    expect(logs[0]).toBe("technical-voice: OFF");
  });

  it("set writes the preference and confirms", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "technical", "--value", "off", "--dir", dir,
    ];
    main();
    expect(logs).toEqual(["voice: set technical=off"]);
    expect(resolveVoice("technical", dir)).toBe("off");
  });

  it("set rejects an unknown axis", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "emotional", "--value", "off", "--dir", dir,
    ];
    main();
    expect(errors[0]).toContain("unknown axis: emotional");
    expect(errors[0]).toContain("technical, conversation");
    expect(process.exitCode).toBe(1);
  });

  it("set rejects an invalid value", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "technical", "--value", "maybe", "--dir", dir,
    ];
    main();
    expect(errors[0]).toContain('invalid value: maybe');
    expect(process.exitCode).toBe(1);
  });

  it("set without required flags fails clearly", () => {
    process.argv = ["node", "voice.ts", "--action", "set", "--dir", dir];
    main();
    expect(errors[0]).toContain("failed");
    expect(process.exitCode).toBe(1);
  });

  it("status fails clearly on a config.yml parse error", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.yml"), "oops\n");
    process.argv = ["node", "voice.ts", "--action", "status", "--dir", dir];
    main();
    expect(errors).toEqual([`voice: failed (${path.join(dir, "config.yml")} line 1: expected 'key: value')`]);
    expect(process.exitCode).toBe(1);
  });
});
