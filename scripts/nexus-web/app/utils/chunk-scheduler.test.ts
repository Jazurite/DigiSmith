import { describe, expect, it } from 'vitest'
import { createChunkScheduler } from './chunk-scheduler'

function setup(total = 90, size = 10) {
  const queue: Array<() => void> = []
  const seen: number[] = []
  const s = createChunkScheduler({ total, size, onChange: n => seen.push(n), schedule: (run) => { queue.push(run); return queue.length }, cancel: () => { queue.length = 0 } })
  return { s, queue, seen }
}

describe('createChunkScheduler', () => {
  it('starts with one chunk and schedules nothing until started', () => {
    const { s, queue } = setup()
    expect(s.shown()).toBe(10)
    expect(queue).toHaveLength(0)
  })
  it('renders one chunk per callback, never all at once', () => {
    const { s, queue, seen } = setup()
    s.start()
    while (queue.length) { expect(queue).toHaveLength(1); queue.shift()!() }
    expect(seen).toEqual([20, 30, 40, 50, 60, 70, 80, 90])
    expect(s.shown()).toBe(90)
  })
  it('start twice does not double the chain', () => {
    const { s, queue } = setup()
    s.start(); s.start()
    expect(queue).toHaveLength(1)
  })
  it('ensure renders up to the chunk that holds the row, synchronously', () => {
    const { s, seen } = setup()
    s.ensure(36)
    expect(s.shown()).toBe(40)
    s.ensure(5)
    expect(s.shown()).toBe(40)
    expect(seen).toEqual([40])
    s.ensure(89)
    expect(s.shown()).toBe(90)
  })
  it('flush renders the rest; the chain then ends', () => {
    const { s, queue } = setup()
    s.start(); s.flush()
    expect(s.shown()).toBe(90)
    queue.shift()!()
    expect(queue).toHaveLength(0)
  })
  it('stop cancels the pending callback', () => {
    const { s, queue } = setup()
    s.start(); s.stop()
    expect(queue).toHaveLength(0)
  })
  it('a list shorter than one chunk is complete at once', () => {
    const { s, queue } = setup(3)
    expect(s.shown()).toBe(3)
    s.start()
    expect(queue).toHaveLength(0)
  })
})
