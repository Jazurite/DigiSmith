<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'
import { BOXES, boxLabel, stateOf } from '../utils/grid-label'

// One chunk of the calendar's rows (a fragment: the rows stay direct children of the grid).
const props = defineProps<{ data: LifeCalendar; from: number; to: number; stopRow: number; stopBox: number }>()
const lastRow = props.data.rows.length - 1
const cur = props.data.current
const rows = computed(() => props.data.rows.slice(props.from, props.to))
</script>

<template>
  <div v-for="row in rows" :key="row.age" class="row" :class="{ 'decade-end': (row.age + 1) % 10 === 0 && row.age < lastRow }" role="row">
    <span class="age" :class="{ labelled: row.age % 10 === 0 }" role="rowheader">
      <span v-if="row.age % 10 === 0" aria-hidden="true">{{ row.age }}</span>
      <span class="sr-only">Age {{ row.age }}</span>
    </span>
    <div
      v-for="n in BOXES" :key="n"
      class="box" role="gridcell"
      :class="stateOf(cur, row.lived, row.age, n - 1)"
      :data-row="row.age" :data-box="n - 1" :data-state="stateOf(cur, row.lived, row.age, n - 1)"
      :tabindex="row.age === props.stopRow && n - 1 === props.stopBox ? 0 : -1"
      :aria-label="boxLabel(row, n - 1, stateOf(cur, row.lived, row.age, n - 1))"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.row { @include g.row-geometry; margin-bottom: var(--gap); }
.row.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.age { grid-column: 1; align-self: center; color: var(--ink-2); font-size: 11px; line-height: 1; }
.box { border-radius: var(--radius-box); outline: none; }
.lived { background: var(--ink); }
.ahead { box-shadow: inset 0 0 0 1px var(--ahead); }
.current { background: var(--accent); box-shadow: 0 0 0 2px var(--accent); position: relative; z-index: 1; }
.box:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; position: relative; z-index: 2; }
.selected { outline: 2px solid var(--ink); outline-offset: 1px; }
.box.current:focus-visible { outline-width: 3px; }
@media (forced-colors: active) {
  .lived { background: CanvasText; } .ahead { box-shadow: none; border: 1px solid GrayText; } .current { background: Highlight; box-shadow: none; }
}
</style>
