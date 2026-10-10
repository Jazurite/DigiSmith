// DGS-334: OpenCode 2.x adapter for maestro-safety.js. 2.x loads a plugin DIRECTORY (server.js or index.js, default export Plugin.define({id, setup(ctx)})); the hook is
// ctx.tool.hook("execute.before", cb) with the call input in `input.input`. This file reuses the 1.x rules unchanged (maestro-safety.js must sit next to it, this file is copied as server.js).
// Throwing from the callback blocks the call. Active only with OPENCODE_SAFETY=1.
import { Plugin } from "@opencode/plugin"
import { appendFileSync } from "node:fs"
import { MaestroSafety } from "./maestro-safety.js"

const TOOL_MAP = { shell: "bash" } // 2.x tool id -> the 1.x name the rules know
const SEEN = process.env.SAFETY_V2_SEEN // optional: file that records tool ids and input key names (never values) for porting

export default Plugin.define({
  id: "maestro-safety-v2",
  setup: async (ctx) => {
    if (process.env.OPENCODE_SAFETY !== "1") return
    const hooks = await MaestroSafety({ directory: ctx.location.directory, client: { session: { messages: async () => ({ data: [] }) } } })
    await ctx.tool.hook("execute.before", async (i) => {
      if (SEEN) appendFileSync(SEEN, JSON.stringify({ tool: i.tool, keys: Object.keys(i.input ?? {}) }) + "\n")
      await hooks["tool.execute.before"]({ tool: TOOL_MAP[i.tool] ?? i.tool, sessionID: i.sessionID, callID: i.id }, { args: i.input ?? {} })
    })
    // Client-run shell (POST /api/session/:id/shell) does not pass execute.before: the same rules judge it as a bash call.
    await ctx.shell.hook("create.before", async (i) => {
      if (SEEN) appendFileSync(SEEN, JSON.stringify({ shell: true, cwd: i.cwd }) + "\n")
      await hooks["tool.execute.before"]({ tool: "bash", sessionID: "client-shell", callID: "client-shell" }, { args: { command: i.command, workdir: i.cwd } })
    })
  },
})
