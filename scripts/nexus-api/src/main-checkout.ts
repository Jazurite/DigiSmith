import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// The one main-checkout path of the API. DIGISMITH_MAIN_CHECKOUT overrides it (read at import, from the API process env).
export const MAIN_CHECKOUT = process.env.DIGISMITH_MAIN_CHECKOUT ?? join(homedir(), 'Workspace', 'Engineering', 'Jazurite', 'DigiSmith')
// The built CLI of the main checkout: the same build the global `dg` runs.
export const MAIN_CLI = join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')

export interface MainCheckout { ok: boolean, path: string, cli: string }

export function checkMainCheckout(): MainCheckout {
  return { ok: existsSync(MAIN_CLI), path: MAIN_CHECKOUT, cli: MAIN_CLI }
}

// The one line shown when the CLI is missing (API start log, jobs route `warning`).
export function missingCliMessage(cli: string = MAIN_CLI): string {
  return `main checkout CLI missing: ${cli} (set DIGISMITH_MAIN_CHECKOUT)`
}
