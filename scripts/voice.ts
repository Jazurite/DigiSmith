import { getPreference, setPreference, DEFAULT_PREFERENCES_PATH } from "./preferences.ts";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const AXES = ["technical", "conversation"] as const;
export type Axis = (typeof AXES)[number];
export type VoiceValue = "on" | "off";

const AXIS_KEY: Record<Axis, string> = {
  technical: "technical_voice",
  conversation: "conversation_voice",
};

const AXIS_STANDARD: Record<Axis, string> = {
  technical: "global/ste100-writing",
  conversation: "global/ai-voice-conversational",
};

export function isAxis(value: string): value is Axis {
  return (AXES as readonly string[]).includes(value);
}

export function standardForAxis(axis: Axis): string {
  return AXIS_STANDARD[axis];
}

export function resolveVoice(axis: Axis, filePath: string): VoiceValue {
  return getPreference(AXIS_KEY[axis], filePath) === "off" ? "off" : "on";
}

export function resolveAllVoices(filePath: string): Record<Axis, VoiceValue> {
  const result = {} as Record<Axis, VoiceValue>;
  for (const axis of AXES) result[axis] = resolveVoice(axis, filePath);
  return result;
}

export function setVoice(axis: Axis, value: VoiceValue, filePath: string): void {
  setPreference(AXIS_KEY[axis], value, filePath);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args.path ?? DEFAULT_PREFERENCES_PATH;
  const action = args.action ?? "status";

  switch (action) {
    case "status": {
      for (const axis of AXES) {
        const value = resolveVoice(axis, filePath);
        console.log(
          value === "on"
            ? `${axis}-voice: ON (${standardForAxis(axis)})`
            : `${axis}-voice: OFF`,
        );
      }
      return;
    }
    case "set": {
      try {
        requireArgs(args, ["axis", "value"]);
      } catch (err) {
        console.error(`voice: failed (${(err as Error).message})`);
        process.exitCode = 1;
        return;
      }
      if (!isAxis(args.axis)) {
        console.error(`voice: failed (unknown axis: ${args.axis}; valid axes: ${AXES.join(", ")})`);
        process.exitCode = 1;
        return;
      }
      if (args.value !== "on" && args.value !== "off") {
        console.error(`voice: failed (invalid value: ${args.value}; must be "on" or "off")`);
        process.exitCode = 1;
        return;
      }
      setVoice(args.axis, args.value, filePath);
      console.log(`voice: set ${args.axis}=${args.value}`);
      return;
    }
    default:
      console.error(`voice: failed (unknown action: ${action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
