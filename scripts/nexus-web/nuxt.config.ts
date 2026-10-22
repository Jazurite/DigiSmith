import { fileURLToPath } from 'node:url'

// Static generation (spec section 11): nuxt generate writes prerendered HTML and JS; Caddy serves the files. No Nitro server. pages/ gives the router; every page is prerendered.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: true,
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/main.scss', '~/assets/nightwatch-tokens.scss'],
  alias: {
    // type-only import of the API app (never bundled), the shared schema and the shared day helpers
    '#api-type': fileURLToPath(new URL('../nexus-api/src/app.ts', import.meta.url)),
    '#life-schema': fileURLToPath(new URL('../nexus-shared/life-calendar.ts', import.meta.url)),
    '#nightwatch-schema': fileURLToPath(new URL('../nexus-shared/nightwatch.ts', import.meta.url)),
    '#days': fileURLToPath(new URL('../nexus-shared/days.ts', import.meta.url)),
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'pazurite',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'robots', content: 'noindex' },
      ],
    },
  },
  experimental: { payloadExtraction: false },   // no payload files: the page requests nothing at load except the API
  typescript: { strict: true },
})
