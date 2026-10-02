import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_DIR } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_DIR);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}
