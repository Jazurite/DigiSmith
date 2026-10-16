import { boxRange, formatLong } from '#days'
import type { LifeCalendar } from '#life-schema'

export const BOXES = 52
export type BoxState = 'lived' | 'current' | 'ahead'
const WORD = { lived: 'lived', current: 'this week', ahead: 'ahead' } as const

export function stateOf(cur: LifeCalendar['current'], rowLived: number, age: number, b: number): BoxState {
  if (b < rowLived) return 'lived'
  if (cur && cur.row === age && cur.box === b) return 'current'
  return 'ahead'
}
export function boxLabel(row: LifeCalendar['rows'][number], b: number, state: BoxState): string {
  const r = boxRange(row, b)
  return `Age ${row.age}, week ${b + 1} of ${BOXES}, ${formatLong(r.from)} to ${formatLong(r.to)}, ${WORD[state]}`
}
