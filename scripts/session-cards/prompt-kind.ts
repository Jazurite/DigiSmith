// DGS-438 (c): which UserPromptSubmit prompts did NOT come from Jack. Positive evidence only: a known
// harness wrapper at the very start of the prompt, or an empty prompt. Anything else is a real prompt,
// so a real message is never dropped. Wrappers seen in recorded transcripts (2026-10-13).
const NOTICE_START = [
  "<task-notification",
  "<system-reminder",
  "<local-command-caveat",
  "<local-command-stdout",
  "[SYSTEM NOTIFICATION",
  "[Cross-session idle notice]",
];

export function isHarnessNotice(prompt: string | undefined): boolean {
  if (typeof prompt !== "string") return false;
  const p = prompt.trimStart();
  return p === "" || NOTICE_START.some((w) => p.startsWith(w));
}
