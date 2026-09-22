import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_PREFERENCES_PATH } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_PREFERENCES_PATH);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}
