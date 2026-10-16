import { join } from 'node:path'
import { startStub } from './stub-server.ts'

const s = await startStub({ dir: join(import.meta.dirname, '../../.output/public'), port: Number(process.env.STUB_PORT ?? 4390) })
console.log(`stub listening ${s.url}`)
