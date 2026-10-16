import { describe, expect, it } from 'vitest'
import { nearestBox, nextCell } from './grid-nav'

const at = (row: number, box: number) => ({ row, box })
describe('nextCell (the Designer keys)', () => {
  it('Left and Right move one week and stop at the row ends of the grid', () => {
    expect(nextCell('ArrowRight', false, at(3, 10), 90)).toEqual(at(3, 11))
    expect(nextCell('ArrowLeft', false, at(3, 10), 90)).toEqual(at(3, 9))
    expect(nextCell('ArrowRight', false, at(3, 51), 90)).toEqual(at(4, 0))   // wraps to the next year
    expect(nextCell('ArrowLeft', false, at(3, 0), 90)).toEqual(at(2, 51))
    expect(nextCell('ArrowLeft', false, at(0, 0), 90)).toEqual(at(0, 0))
    expect(nextCell('ArrowRight', false, at(89, 51), 90)).toEqual(at(89, 51))
  })
  it('Up and Down keep the week and change the year', () => {
    expect(nextCell('ArrowDown', false, at(3, 10), 90)).toEqual(at(4, 10))
    expect(nextCell('ArrowUp', false, at(3, 10), 90)).toEqual(at(2, 10))
    expect(nextCell('ArrowUp', false, at(0, 10), 90)).toEqual(at(0, 10))
    expect(nextCell('ArrowDown', false, at(89, 10), 90)).toEqual(at(89, 10))
  })
  it('Home and End go to the first and last week of the row; with Ctrl, to the first and last box', () => {
    expect(nextCell('Home', false, at(3, 10), 90)).toEqual(at(3, 0))
    expect(nextCell('End', false, at(3, 10), 90)).toEqual(at(3, 51))
    expect(nextCell('Home', true, at(3, 10), 90)).toEqual(at(0, 0))
    expect(nextCell('End', true, at(3, 10), 90)).toEqual(at(89, 51))
  })
  it('Page Up and Page Down move 10 years, clamped', () => {
    expect(nextCell('PageDown', false, at(3, 10), 90)).toEqual(at(13, 10))
    expect(nextCell('PageUp', false, at(3, 10), 90)).toEqual(at(0, 10))
    expect(nextCell('PageDown', false, at(85, 10), 90)).toEqual(at(89, 10))
  })
  it('other keys return null', () => { expect(nextCell('a', false, at(0, 0), 90)).toBeNull() })
})

describe('nearestBox (touch, within 14 px)', () => {
  const box = (name: string) => ({ name }) as unknown as Element
  it('returns the box under the finger when there is one', () => {
    expect(nearestBox(10, 10, () => box('here'))).toEqual(box('here'))
  })
  it('probes around the finger, nearest ring first, and gives up beyond the radius', () => {
    const seen: [number, number][] = []
    const found = nearestBox(100, 100, (x, y) => { seen.push([x, y]); return x === 107 && y === 100 ? box('near') : null })
    expect(found).toEqual(box('near'))
    expect(seen[0]).toEqual([100, 100])
    expect(nearestBox(100, 100, () => null)).toBeNull()
    expect(nearestBox(100, 100, (x, y) => (Math.hypot(x - 100, y - 100) > 14 ? box('far') : null))).toBeNull()
  })
})
