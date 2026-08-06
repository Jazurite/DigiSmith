# Custom Element Component Pattern

Build interactive/reactive UI as custom elements extending the shared
`Element` (or `Container` / `Button`) base class from `web-components.js`,
not plain `HTMLElement` or ad-hoc jQuery:

```js
if (!customElements.get("quantity-adjuster")) {
  customElements.define("quantity-adjuster", class QuantityAdjuster extends Element {
    props = { index: 0, size: 32, min: null, max: null };

    template() { return `...`; }
  });
}
```

```liquid
<quantity-adjuster :index="{{ item.index }}" :value="{{ item.quantity }}"></quantity-adjuster>
```

- Declare a `props` object with defaults; the base class reads matching
  `:propName` attributes automatically, JSON-parses them, and coerces
  booleans based on the default's type.
- Pass arrays/objects through the `json | escape` filter so they survive
  as an HTML attribute and `JSON.parse` cleanly:
  `:options="{{ variants | json | escape }}"`.
- Always guard `customElements.define` with
  `if (!customElements.get("tag-name"))`. Shopify re-renders section and
  snippet markup (theme editor, AJAX cart/section updates), so the same
  script can execute more than once per page — an unguarded `define` call
  throws and breaks every component that loads after it.
- Override lifecycle hooks (`created`, `beforeMount`, `render` /
  `template`, `mounted`, `onDestroy`) instead of wiring
  `connectedCallback` directly.

**Why:** the theme has no app framework (no React/Vue) but needs
consistent reactive behavior across 40+ independent components rendered
from scattered Liquid fragments. The shared base class gives every
component the same prop-parsing, render loop, and loading/disabled state
handling for free, so components stay small and behave consistently.
