import type { LifeCalendar } from '#life-schema'

export type LifeState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: LifeCalendar }
  | { kind: 'error' }
  | { kind: 'locked' }
  | { kind: 'empty' }
