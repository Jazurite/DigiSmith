<script setup lang="ts">
import { boxRange, formatLong } from '#days'
import type { LifeCalendar } from '#life-schema'

const props = defineProps<{ data: LifeCalendar }>()
const BOXES = 52
const cur = props.data.current
// the one tab stop: this week, or the first box when there is none
const startRow = cur?.row ?? 0
const startBox = cur?.box ?? 0

function stateOf(rowLived: number, age: number, b: number): 'lived' | 'current' | 'ahead' {
  if (b < rowLived) return 'lived'
  if (cur && cur.row === age && cur.box === b) return 'current'
  return 'ahead'
}
const WORD = { lived: 'lived', current: 'this week', ahead: 'ahead' } as const
function label(row: LifeCalendar['rows'][number], b: number, state: 'lived' | 'current' | 'ahead'): string {
  const r = boxRange(row, b)
  return `Age ${row.age}, week ${b + 1} of ${BOXES}, ${formatLong(r.from)} to ${formatLong(r.to)}, ${WORD[state]}`
}
const WEEK_MARKS = [0, 12, 25, 38, 51]
const lastRow = props.data.rows.length - 1
</script>

<template>
  <div class="grid-wrap">
  <div id="calendar-grid" v-once class="grid" role="grid" aria-label="Your life in weeks. One row per year of age, 52 boxes per row. Use the arrow keys to move between weeks." :aria-rowcount="data.rows.length + 1" :aria-colcount="BOXES + 1">
    <div class="row ruler" role="row">
      <span class="corner" role="columnheader">Age</span>
      <span v-for="m in WEEK_MARKS" :key="m" class="mark" role="columnheader" :style="{ gridColumn: m + 2 }">Week {{ m + 1 }}</span>
    </div>
    <div v-for="row in data.rows" :key="row.age" class="row" :class="{ 'decade-end': (row.age + 1) % 10 === 0 && row.age < lastRow }" role="row">
      <span class="age" :class="{ labelled: row.age % 10 === 0 }" role="rowheader">
        <span v-if="row.age % 10 === 0" aria-hidden="true">{{ row.age }}</span>
        <span class="sr-only">Age {{ row.age }}</span>
      </span>
      <div
        v-for="n in BOXES" :key="n"
        class="box" role="gridcell"
        :class="stateOf(row.lived, row.age, n - 1)"
        :data-row="row.age" :data-box="n - 1" :data-state="stateOf(row.lived, row.age, n - 1)"
        :tabindex="row.age === startRow && n - 1 === startBox ? 0 : -1"
        :aria-label="label(row, n - 1, stateOf(row.lived, row.age, n - 1))"
      />
    </div>
  </div>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.grid { @include g.grid-geometry; }
.row { @include g.row-geometry; margin-bottom: var(--gap); }
.row.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.ruler { height: g.$ruler-h; grid-auto-rows: auto; margin-bottom: g.$ruler-gap; color: var(--ink-2); font-size: 11px; line-height: g.$ruler-h; }
.corner { grid-column: 1; }
.mark { white-space: nowrap; }
.age { grid-column: 1; align-self: center; color: var(--ink-2); font-size: 11px; line-height: 1; }
.box { border-radius: var(--radius-box); outline: none; }
.lived { background: var(--ink); }
.ahead { box-shadow: inset 0 0 0 1px var(--ahead); }
.current { background: var(--accent); box-shadow: 0 0 0 2px var(--accent); position: relative; z-index: 1; }
.box:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; position: relative; z-index: 2; }
.box.current:focus-visible { outline-width: 3px; }
@media (forced-colors: active) {
  .lived { background: CanvasText; } .ahead { box-shadow: none; border: 1px solid GrayText; } .current { background: Highlight; box-shadow: none; }
}
</style>
