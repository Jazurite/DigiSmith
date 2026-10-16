import '../app/assets/main.scss'

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
