<template>
  <ul class="legend">
    <li><span class="sw lived" aria-hidden="true" />Lived</li>
    <li><span class="sw current" aria-hidden="true" />This week</li>
    <li><span class="sw ahead" aria-hidden="true" />Ahead</li>
  </ul>
</template>

<style scoped lang="scss">
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0 0 12px; padding: 0; list-style: none; color: var(--ink-2); font-size: 13px; }
li { display: inline-flex; align-items: center; gap: 8px; }
.sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.lived { background: var(--ink); }
.current { background: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
.ahead { border: 1px solid var(--ahead); }
</style>
