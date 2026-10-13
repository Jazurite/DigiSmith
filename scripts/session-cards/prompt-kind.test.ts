import { describe, it, expect } from "vitest";
import { isHarnessNotice } from "./prompt-kind.ts";

describe("isHarnessNotice (DGS-438 c)", () => {
  it.each([
    "<task-notification>\n<task-id>b1</task-id>\n</task-notification>",
    "  <task-notification> x",
    "[SYSTEM NOTIFICATION - NOT USER INPUT]\nThis is an automated background-task event",
    "[Cross-session idle notice] another session...",
    "<system-reminder>The user named...</system-reminder>",
    "<local-command-caveat>Caveat: the messages below</local-command-caveat>",
    "<local-command-stdout>Set model</local-command-stdout>",
    "",
    "   \n",
  ])("is a notice: %j", (p) => expect(isHarnessNotice(p)).toBe(true));

  it.each([
    "catch me up",
    "what is the status of <task-notification> handling?",
    "[Image: source: /tmp/x.png] what is this",
    "[Request interrupted by user] ok go on",
    '<pasted_content id="9844"> M file</pasted_content> fix it',
    "/reload-plugins",
    "SYSTEM NOTIFICATION without the bracket",
  ])("is a real prompt: %j", (p) => expect(isHarnessNotice(p)).toBe(false));

  it("a missing prompt field is not evidence: treated as real", () => {
    expect(isHarnessNotice(undefined)).toBe(false);
  });
});
