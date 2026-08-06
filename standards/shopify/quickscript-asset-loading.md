# Deferred Asset Loading with `quickscript`

Load section/component JS and CSS through the `quickscript` inert-tag
convention, not native `<script src>` / `<link rel="stylesheet">`:

```liquid
<script type="quickscript" loading="delayed" src="{{ 'accordion.js' | asset_url }}"></script>
<link rel="quickscript" loading="delayed" href="{{ 'accordion.css' | asset_url }}">
```

`type="quickscript"` / `rel="quickscript"` are not real values, so the
browser treats the tag as inert — nothing loads until the runtime loader
(`quickscript-beta.min.js`, loaded once in `critical-resources.liquid`)
picks it up and fetches it according to `loading`:

- `delayed` (most common) — after the page goes idle/interactive
- `visibility` — only once the element scrolls into view (hidden at 1x1px
  via CSS until then, see `critical-stylesheet.liquid`)
- `interactive` — on first user interaction (used for 3rd-party trackers)
- omitted — loaded immediately by the loader, still non-blocking (used for
  base classes every component depends on, e.g. `lazy-component.js`,
  `loading-overlay.js`)

**Why:** this theme renders 100+ sections per page; loading every
section's JS/CSS eagerly via native tags blocks rendering and tanks Core
Web Vitals. The inert-tag trick defers fetch/execution without needing
each section to hand-roll its own lazy-loading logic.

**Exception:** code that must exist before first paint — inline critical
CSS/JS (theme color tokens, the `Shop`/`routes` globals) and the loader
script itself — still uses real `<script>` / `<link>` tags.

**Common mistake:** pasting a plain `<script src="...">` tag for a new
section's JS. It "works" in the browser by default, which hides the
regression — but it silently opts that asset out of deferral in
production and reintroduces the render-blocking cost this convention
exists to avoid.
