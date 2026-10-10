// DGS-334: OpenCode 2.x key plugin (the 1.x tokenreply-key.js used the `config` hook, which 2.x does not have).
// Gives the tokenreply provider its key from ~/.digismith-depot/.env, loaded with dotenv in memory only, and adds it as an authorization header to each model request (session hook `model.request`).
// NOT through the provider definition (provider.transform headers): GET /api/provider/tokenreply returns provider headers, so the key would be readable by any client with the server password.
// Reads ONLY TOKENREPLY_API_KEY. Never writes, logs or prints it, never puts it in process.env. Shell commands never see it (and any *_API_KEY, *_TOKEN, *_AUTH is stripped from their env).
// Install as a plugin DIRECTORY: <dir>/server.js (this file) + package.json {"type":"module"} + dotenv and @opencode/plugin in node_modules (pnpm).
import { Plugin } from "@opencode/plugin"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse } from "dotenv"

let key
function loadKey() {
  if (key) return key
  try {
    key = parse(readFileSync(join(homedir(), ".digismith-depot", ".env"))).TOKENREPLY_API_KEY
  } catch {}
  return key
}

export default Plugin.define({
  id: "tokenreply-key-v2",
  setup: async (ctx) => {
    await ctx.shell.hook("create.before", (input) => {
      for (const name of Object.keys(input.env)) {
        if (/(_API_KEY|_TOKEN|_AUTH)$/i.test(name) || name === "TOKENREPLY_API_KEY") delete input.env[name]
      }
    })
    await ctx.session.hook("model.request", (req) => {
      if (req.model.providerID !== "tokenreply") return
      const k = loadKey()
      if (k) req.headers = { ...req.headers, authorization: `Bearer ${k}` }
    })
  },
})
