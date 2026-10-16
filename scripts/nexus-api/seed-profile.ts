// The seed step (DGS-481). Reads the private input, encrypts it, stores it. Prints nothing on success; on failure only the step name.
// It never prints a value or a key, and never changes or deletes the input file.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseDay } from '../nexus-shared/days.ts'
import { fileKeyProvider } from './src/key-provider.ts'
import { todayUtc7 } from './src/life-calendar.ts'
import { seal } from './src/profile-crypto.ts'
import { openStore } from './src/profile-store.ts'

export class SeedError extends Error {
  readonly step: string
  constructor(step: string) { super(step); this.step = step }
}

// Private to the API folder: never shared with the page.
const inputSchema = z.strictObject({ birthDate: z.string(), lifeYears: z.number().int().min(1).max(120) })

export interface SeedOptions { inputPath: string; dataDir: string; keyFile: string; now?: number }

export async function seed(opts: SeedOptions): Promise<void> {
  if (!existsSync(opts.inputPath)) throw new SeedError('input_missing')
  if ((statSync(opts.inputPath).mode & 0o077) !== 0) throw new SeedError('input_mode')
  let raw: unknown
  try { raw = JSON.parse(readFileSync(opts.inputPath, 'utf8')) } catch { throw new SeedError('input_json') }
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    // Only the field NAME, never a value or a Zod message.
    const field = parsed.error.issues[0]?.path[0]
    throw new SeedError(typeof field === 'string' ? `field:${field}` : 'input_invalid')
  }
  const profile = parsed.data
  try {
    const day = parseDay(profile.birthDate)
    if (day > parseDay(todayUtc7(opts.now ?? Date.now()))) throw new Error('future')
  } catch { throw new SeedError('field:birthDate') }
  let key: Buffer
  try { key = await fileKeyProvider(opts.keyFile, { create: true }).getKey() } catch { throw new SeedError('key') }
  const sealed = seal(profile, key)
  let store
  try { store = await openStore(opts.dataDir, { create: true }) } catch { throw new SeedError('store') }
  try { await store.save(sealed, 1) } catch { throw new SeedError('store') } finally { await store.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  seed({ inputPath: join(d, 'nexus', 'profile.private.json'), dataDir: join(d, 'nexus', 'db'), keyFile: join(d, 'nexus', 'profile.key') })
    .then(() => process.exit(0))
    .catch(e => { process.stderr.write(`seed failed: ${e instanceof SeedError ? e.step : 'unexpected'}\n`); process.exit(1) })
}
