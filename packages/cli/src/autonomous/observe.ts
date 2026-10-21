import type { AttentionView, GitView, HerdrView, Obs, Observations, PackView, RunView, VerdictView } from "./phase-types.ts";

export interface Observers {
  runs(): Promise<RunView[]>; packs(): Promise<PackView[]>; verdicts(): Promise<VerdictView[]>;
  git(): Promise<GitView>; tracker(): Promise<{ status: string }>; herdr(): Promise<HerdrView>;
  attention(): Promise<AttentionView[]>;
}

export async function safe<T>(fn: () => Promise<T>, ms: number): Promise<Obs<T>> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms); });
    return { ok: true, value: await Promise.race([fn(), timeout]) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function observeAll(o: Observers, ms = 20000): Promise<Observations> {
  const [runs, packs, verdicts, git, tracker, herdr, attention] = await Promise.all([
    safe(() => o.runs(), ms), safe(() => o.packs(), ms), safe(() => o.verdicts(), ms),
    safe(() => o.git(), ms), safe(() => o.tracker(), ms), safe(() => o.herdr(), ms), safe(() => o.attention(), ms),
  ]);
  return { runs, packs, verdicts, git, tracker, herdr, attention };
}
