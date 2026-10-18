import { describe, expect, it } from 'vitest'
import type { JobDef, JobInfo, RunRecord } from './types.ts'

describe('scheduler types', () => {
  it('lets a run-now-only job carry no schedule', () => {
    const def: JobDef = {
      name: 'x', description: 'd', command: { file: '/bin/true', args: [] },
      timeoutMs: 1000, catchUp: 'skip', order: 100, notify: 'failures', manualOutsideWindow: 'allowed',
    }
    const info: JobInfo = {
      name: def.name, description: def.description, schedule: null,
      nextRunAt: null, nextRunAtUtc7: null, running: null, lastRun: null,
    }
    expect(info.schedule).toBeNull()
  })

  it('covers every run status and trigger', () => {
    const rec: RunRecord = {
      id: 'i', job: 'x', trigger: 'manual', slot: null, status: 'skipped',
      startedAt: '', startedAtUtc7: '', endedAt: null, durationMs: null, exitCode: null, detail: '',
    }
    expect(rec.slot).toBeNull()
  })
})
