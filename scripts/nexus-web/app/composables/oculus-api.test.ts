// scripts/nexus-web/app/composables/oculus-api.test.ts
import { describe, expect, it } from 'vitest'
import { liveFixture } from '../../tests/oculus-fixtures'
import { loadEvents, loadLive, loadOverview, loadRuns, OculusApiError } from './oculus-api'

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const row = { run: 'b-1', ticket: 'DGS-1', role: 'builder', project: null, source: 'start', seat: null, model: null, trigger: 'manual', state: 'healthy', phase: null, phaseSince: null, startedAt: '2026-10-22T01:00:00.000Z', endedAt: null, elapsedSec: 0, events: 0, merged: false, pushed: false, tokens: null, tokensAsOf: null }

describe('oculus-api', () => {
  it('requests the right URL with the query and parses the answer', async () => {
    let url = ''
    const fetch = async (u: string | URL | Request) => { url = String(u); return json(200, { readAt: '2026-10-22T01:00:00.000Z', total: 1, runs: [row] })() }
    const out = await loadRuns({ role: 'builder', limit: 20 }, { base: 'http://h', fetch: fetch as typeof globalThis.fetch })
    expect(url).toBe('http://h/api/v1/oculus/runs?role=builder&limit=20')
    expect(out.total).toBe(1)
  })
  it('throws OculusApiError with the code on an error body', async () => {
    await expect(loadOverview({ base: 'http://h', fetch: json(503, { error: 'reader_unavailable' }) as typeof fetch })).rejects.toMatchObject({ status: 503, code: 'reader_unavailable' })
  })
  it('throws when the answer does not match the schema', async () => {
    await expect(loadOverview({ base: 'http://h', fetch: json(200, { nope: 1 }) as typeof fetch })).rejects.toBeInstanceOf(OculusApiError)
  })
  it('events send the cursor and the group', async () => {
    let url = ''
    const fetch = async (u: string | URL | Request) => { url = String(u); return json(200, { run: 'b-1', total: 0, from: 5, lines: [] })() }
    await loadEvents('b-1', { since: 5, group: 'errors', tail: 200 }, { base: 'http://h', fetch: fetch as typeof globalThis.fetch })
    expect(url).toBe('http://h/api/v1/oculus/runs/b-1/events?since=5&group=errors&tail=200')
  })
  it('live calls /live and rejects an extra agent field as bad_answer (DGS-599)', async () => {
    let url = ''
    const body = liveFixture()
    const fetch = async (u: string | URL | Request) => { url = String(u); return json(200, body)() }
    const out = await loadLive({ base: 'http://h', fetch: fetch as typeof globalThis.fetch })
    expect(url).toBe('http://h/api/v1/oculus/live')
    expect(out.agents).toHaveLength(7)
    const extra = { ...body, agents: [{ ...body.agents[0], terminal_title: 'x' }] }
    await expect(loadLive({ base: 'http://h', fetch: json(200, extra) as typeof fetch })).rejects.toMatchObject({ status: 200, code: 'bad_answer' })
  })
})
