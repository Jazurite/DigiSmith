import { describe, expect, it } from 'vitest'
import { createLogger } from './logger.ts'

function collect() {
  const lines: string[] = []
  return { lines, logger: createLogger(l => lines.push(l), () => 0) }
}

describe('logger', () => {
  it('writes one JSON line with fixed fields', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/api/v1/life-calendar', status: 503, ms: 3.4, code: 'key_unavailable' })
    expect(JSON.parse(lines[0])).toEqual({ time: '1970-01-01T00:00:00.000Z', level: 'info', method: 'GET', path: '/api/v1/life-calendar', status: 503, ms: 3, code: 'key_unavailable' })
  })
  it('turns a code that is not on the list into "unknown"', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/x', status: 500, ms: 1, code: 'text that could hold a value' })
    expect(JSON.parse(lines[0]).code).toBe('unknown')
    expect(lines[0]).not.toContain('could hold')
  })
  it('cuts a very long path', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/' + 'a'.repeat(500), status: 404, ms: 1 })
    expect(JSON.parse(lines[0]).path.length).toBe(200)
  })
  it('the start-up line has host and port only', () => {
    const { lines, logger } = collect()
    logger.info('listening', { host: '127.0.0.1', port: 4300 })
    expect(JSON.parse(lines[0])).toEqual({ time: '1970-01-01T00:00:00.000Z', level: 'info', msg: 'listening', host: '127.0.0.1', port: 4300 })
  })
  it('the scheduler error line has a fixed place and a short code only', () => {
    const { lines, logger } = collect()
    logger.error('scheduler_error', { where: 'append_run', code: 'ENOTDIR' })
    logger.error('scheduler_error', { where: 'somewhere /secret/path', code: 'text with a value' })
    expect(JSON.parse(lines[0])).toEqual({ time: '1970-01-01T00:00:00.000Z', level: 'error', msg: 'scheduler_error', where: 'append_run', code: 'ENOTDIR' })
    expect(JSON.parse(lines[1])).toMatchObject({ where: 'unknown', code: 'unknown' })
    logger.error('scheduler_error', { where: 'notify', code: 'failed' })
    expect(JSON.parse(lines[2])).toMatchObject({ where: 'notify', code: 'failed' })
  })
  it('keeps the jobs route codes and the server stop places', () => {
    const { lines, logger } = collect()
    for (const code of ['already_running', 'forbidden', 'stopped']) logger.request({ method: 'POST', path: '/x', status: 409, ms: 1, code })
    logger.error('scheduler_error', { where: 'stop', code: 'Error' })
    logger.error('scheduler_error', { where: 'unhandled_rejection', code: 'TypeError' })
    expect(lines.map(l => JSON.parse(l).code)).toEqual(['already_running', 'forbidden', 'stopped', 'Error', 'TypeError'])
    expect(lines.slice(3).map(l => JSON.parse(l).where)).toEqual(['stop', 'unhandled_rejection'])
  })
})
