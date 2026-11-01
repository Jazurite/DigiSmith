// runs_on values: "herdr <pane>" on the default herdr session, "herdr <session>/<pane>" on a named one, "workbox" outside herdr.
export interface RunsOn { session: string; workspace: string; pane: string }

const RE = /^herdr (?:([A-Za-z][\w-]*)\/)?(w\d+):(\S+)$/;

export function parseRunsOn(s: string | undefined): RunsOn | null {
  const m = s ? RE.exec(s) : null;
  if (!m) return null;
  const [, session, workspace, paneTab] = m;
  return { session: session ?? "default", workspace, pane: `${workspace}:${paneTab}` };
}

const SESSION = /^[A-Za-z][\w-]*$/;
const PANE = /^w\d+:\S+$/;

// Never writes a value parseRunsOn rejects: a bad pane falls back to "workbox", a bad session to the default-style format.
export function formatRunsOn(env: NodeJS.ProcessEnv): string {
  const pane = env.HERDR_PANE_ID;
  if (!pane || !PANE.test(pane)) return "workbox";
  const session = env.HERDR_SESSION;
  return !session || session === "default" || !SESSION.test(session) ? `herdr ${pane}` : `herdr ${session}/${pane}`;
}
