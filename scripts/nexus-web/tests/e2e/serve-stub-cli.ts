import { join } from 'node:path'
import { startStub } from './stub-server.ts'

const life = await startStub({ dir: join(import.meta.dirname, '../../.output/public'), port: Number(process.env.STUB_PORT ?? 4390) })
const oculus = await startStub({ dir: join(import.meta.dirname, '../../.output-oculus/public'), port: Number(process.env.STUB_OCULUS_PORT ?? 4391) })
await oculus.setMode('oc-ok')
console.log(`stub listening ${life.url} ${oculus.url}`)
