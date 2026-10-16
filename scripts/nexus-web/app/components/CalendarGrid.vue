<script setup lang="ts">
import { boxRange, formatLong } from '#days'
import type { LifeCalendar } from '#life-schema'
import { nearestBox, nextCell } from '../utils/grid-nav'
import { placeTooltip } from '../utils/tooltip-place'
import type { TipInfo } from './WeekTooltip.vue'

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
const MARK_SPAN = 7   // a mark spans 7 columns so its text stays inside the grid; the last one is anchored to the right edge
const WEEK_MARKS = [0, 12, 25, 38, 51]
const lastRow = props.data.rows.length - 1

const tip = ref<TipInfo | null>(null)
const mode = ref<'pointer' | 'readout'>('pointer')
const selected = ref<HTMLElement | null>(null)
let described: HTMLElement | null = null
let frame = 0

function cellOf(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.('[data-row]') ?? null
}
function infoOf(el: HTMLElement): TipInfo | null {
  const row = props.data.rows[Number(el.dataset.row)]
  if (!row) return null
  const box = Number(el.dataset.box)
  const r = boxRange(row, box)
  return { age: row.age, week: box + 1, from: r.from, to: r.to, state: el.dataset.state as TipInfo['state'] }
}
function describe(el: HTMLElement | null) {
  described?.removeAttribute('aria-describedby')
  described = el
  el?.setAttribute('aria-describedby', 'week-tooltip')
}
function move(x: number, y: number) {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const t = document.getElementById('week-tooltip')
    if (!t) return
    const p = placeTooltip({ x, y }, { w: t.offsetWidth, h: t.offsetHeight }, { w: innerWidth, h: innerHeight })
    t.style.transform = `translate(${p.x}px, ${p.y}px)`
  })
}
function hide() { tip.value = null; describe(null); selected.value?.classList.remove('selected'); selected.value = null }

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  const el = cellOf(e.target)
  if (!el) { hide(); return }
  mode.value = 'pointer'
  if (el !== described) { const i = infoOf(el); if (!i) return; tip.value = i; describe(el) }
  move(e.clientX, e.clientY)
}
function onPointerUp(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  const el = nearestBox(e.clientX, e.clientY, (x, y) => cellOf(document.elementFromPoint(x, y))) as HTMLElement | null
  hide()
  if (!el) return
  const i = infoOf(el)
  if (!i) return
  mode.value = 'readout'
  selected.value = el; el.classList.add('selected')
  tip.value = i
}
function setStop(el: HTMLElement) {   // roving tabindex: exactly one box is the tab stop
  if (el.getAttribute('tabindex') === '0') return
  document.querySelector('#calendar-grid [tabindex="0"]')?.setAttribute('tabindex', '-1')
  el.setAttribute('tabindex', '0')
}
function activate(el: HTMLElement) { setStop(el); el.focus() }
function showAnchored(el: HTMLElement) {
  const i = infoOf(el)
  if (!i) return
  mode.value = 'pointer'
  tip.value = i; describe(el)
  const r = el.getBoundingClientRect()
  move(r.left + r.width / 2, r.top)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { hide(); return }
  // leave browser shortcuts alone (Alt+Arrow = Back); Ctrl/Cmd only mean something with Home and End
  if (e.altKey || e.shiftKey) return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key !== 'Home' && e.key !== 'End') return
  const el = cellOf(e.target)
  if (!el) return
  const next = nextCell(e.key, mod, { row: Number(el.dataset.row), box: Number(el.dataset.box) }, props.data.rows.length)
  if (!next) return
  e.preventDefault()
  const target = document.querySelector<HTMLElement>(`#calendar-grid [data-row="${next.row}"][data-box="${next.box}"]`)
  if (target) { activate(target); showAnchored(target) }
}
function onFocusIn(e: FocusEvent) {
  const el = cellOf(e.target)
  if (!el) return
  setStop(el)
  let visible = true
  try { visible = el.matches(':focus-visible') } catch { visible = true }   // a mouse click must not show the anchored tooltip
  if (visible) showAnchored(el)
}
function onFocusOut(e: FocusEvent) {
  // touch: the compat mousedown after pointerup moves focus and must not wipe the readout
  if (mode.value === 'readout') return
  const to = e.relatedTarget as Node | null
  if (to && document.getElementById('calendar-grid')?.contains(to)) return   // still inside the grid
  hide()
}
// WCAG 1.4.13 dismissible: Escape closes a visible tip wherever the focus is
function onDocKeydown(e: KeyboardEvent) { if (e.key === 'Escape') hide() }
watch(tip, (v) => {
  if (v) document.addEventListener('keydown', onDocKeydown)
  else document.removeEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onDocKeydown) })
</script>

<template>
  <div class="grid-wrap">
  <div id="calendar-grid" v-once class="grid" role="grid" @pointermove="onPointerMove" @pointerleave="hide" @pointerup="onPointerUp" @keydown="onKeydown" @focusin="onFocusIn" @focusout="onFocusOut" aria-label="Your life in weeks. One row per year of age, 52 boxes per row. Use the arrow keys to move between weeks." :aria-rowcount="data.rows.length + 1" :aria-colcount="BOXES + 1">
    <div class="row ruler" role="row">
      <span class="corner" role="columnheader">Age</span>
      <span v-for="m in WEEK_MARKS" :key="m" class="mark" :class="{ last: m === BOXES - 1 }" role="columnheader" :style="{ gridColumn: m === BOXES - 1 ? `${m + 3 - MARK_SPAN} / ${m + 3}` : `${m + 2} / span ${MARK_SPAN}` }">Week {{ m + 1 }}</span>
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
  <Teleport to="body"><WeekTooltip :info="tip" :mode="mode" /></Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.grid { @include g.grid-geometry; }
.row { @include g.row-geometry; margin-bottom: var(--gap); }
.row.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.ruler { height: g.$ruler-h; grid-auto-rows: auto; margin-bottom: g.$ruler-gap; color: var(--ink-2); font-size: 11px; line-height: g.$ruler-h; }
.corner { grid-column: 1; }
.mark { white-space: nowrap; overflow: hidden; }
.mark.last { text-align: right; }
@media (max-width: 639px) { .ruler { font-size: 10px; } }
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
