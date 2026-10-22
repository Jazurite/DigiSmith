import '../app/assets/main.scss'
import '../app/assets/nightwatch-tokens.scss'

// @storybook-vue/nuxt 10.0.1 was built for Nuxt 4.4: it stores the app in `unctx`. Nuxt 4.6 reads the browser app from
// globalThis.__nuxt_app_ctx__ instead, so every story threw NUXT_E1001. Point the two keys the framework uses at the
// `unctx` store the framework writes to, so both sides see one app.
type Ctx = { tryUse: () => unknown }
const g = globalThis as unknown as { __nuxt_app_ctx__?: Record<string, Ctx>; __unctx__?: { get: (key: string) => Ctx } }
const registry = (g.__nuxt_app_ctx__ ||= {})
for (const key of ['nuxt-app', 'nuxt-app-storybook-root']) Object.defineProperty(registry, key, { configurable: true, get: () => g.__unctx__!.get(key) })

export default {
  globalTypes: {
    theme: { description: 'Colour scheme', toolbar: { title: 'Theme', dynamicTitle: true, items: [{ value: 'device', title: 'Device' }, { value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }] } },
  },
  initialGlobals: { theme: 'device' },
  decorators: [
    // the toolbar item sets data-theme so Jack can compare both schemes on one device; the tests use browser emulation instead
    (story: () => unknown, ctx: { globals: { theme?: string } }) => {
      const t = ctx.globals.theme
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
      else delete document.documentElement.dataset.theme
      return story()
    },
    // no story may reach the API or anything else
    (story: () => unknown) => {
      window.fetch = (() => { throw new Error('stories must not fetch') }) as typeof fetch
      return story()
    },
  ],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
}
