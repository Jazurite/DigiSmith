import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltip-place'

const size = { w: 200, h: 60 }, view = { w: 1000, h: 800 }
describe('placeTooltip', () => {
  it('puts the tooltip 14 px up and right of the pointer', () => {
    expect(placeTooltip({ x: 100, y: 300 }, size, view)).toEqual({ x: 114, y: 300 - 14 - 60 })
  })
  it('flips left near the right edge and below near the top edge', () => {
    expect(placeTooltip({ x: 950, y: 300 }, size, view).x).toBe(950 - 14 - 200)
    expect(placeTooltip({ x: 100, y: 20 }, size, view).y).toBe(20 + 14)
  })
  it('never leaves the window', () => {
    const p = placeTooltip({ x: 5, y: 5 }, { w: 2000, h: 2000 }, view)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
  })
})
