import { describe, it, expect, vi } from "vitest";
import { claudeRunner, MODEL_ID } from "./model.ts";

describe("claudeRunner", () => {
  it("runs claude -p with the small model and returns the result text", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result: '{"a":1}' }) });
    const out = await claudeRunner(exec)("PROMPT");
    expect(out).toBe('{"a":1}');
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual(expect.arrayContaining(["-p", "--model", MODEL_ID, "--output-format", "json"]));
    expect(opts.input).toBe("PROMPT");
  });
  it("throws when the output has no result string", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "{}" });
    await expect(claudeRunner(exec)("p")).rejects.toThrow(/result/);
  });
  it("throws when claude reports an error, so the caller falls back", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ is_error: true, result: "Failed to authenticate" }) });
    await expect(claudeRunner(exec)("p")).rejects.toThrow(/Failed to authenticate/);
  });
});
