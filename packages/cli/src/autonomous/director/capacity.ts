import { refusal, type Count } from "../../run/limit.ts";

/** null = the lane is free, a string = why it is not. */
export interface LaneState { build: string | null; refine: string | null; stale: string[] }

/** Pure: one look at the two lanes. An unreadable count gives "unknown" for both lanes and never throws. */
export function laneState(count: Count, buildLock: { ticket: string } | null, refineLock: { ticket: string } | null): LaneState {
  let build: string | null;
  let refine: string | null;
  let stale: string[] = [];
  let counted = true;
  let buildFull: string | null = null;
  let roleFull: string | null = null;
  try {
    buildFull = refusal(count, "builder");
    roleFull = refusal(count, "role");
    stale = count.stale.map((s) => s.run);
  } catch {
    counted = false;
  }
  if (buildLock !== null) build = `factory lock held by ${buildLock.ticket}`;
  else build = counted ? buildFull : "unknown";
  if (refineLock !== null) refine = `refine lock held by ${refineLock.ticket}`;
  else refine = counted ? roleFull : "unknown";
  return { build, refine, stale };
}
