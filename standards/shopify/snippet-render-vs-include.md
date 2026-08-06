# Snippet Inclusion: `render`, Not `include`

Use `{% render 'snippet-name', param: value %}` for all snippet calls. Never
write new `{% include %}` calls.

```liquid
{% render 'product-price', product: product, variant: current_variant %}
```

- `render` scopes the snippet to only what's explicitly passed in — no
  reading or leaking `assign`/`capture` variables from the caller.
- `include` shares the caller's scope, which is the exact problem `render`
  was introduced to fix (Shopify has deprecated `include`).

**Common mistake:** copying an existing `{% include %}` call as a template
for new code — e.g. `responsive-image`, `bgset`, `icon-chevron-*`,
`no-blocks`, `product-card-grid`. ~68 snippets still use `include` from
before the codebase standardized on `render`; that's legacy debt, not a
pattern to follow. Call them with `render` going forward — don't add new
`include` callers, and migrate opportunistically when touching one.
