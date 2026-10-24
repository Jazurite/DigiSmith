import { fileURLToPath } from 'node:url'
import { siteOf, sitePages } from './site-pages'

const SITE = siteOf(process.env)
const ROUTES = SITE === 'oculus' ? ['/', '/attention/', '/runs/', '/run/', '/plan/'] : ['/']

// Static generation (spec section 11): nuxt generate writes prerendered HTML and JS; Caddy serves the files. No Nitro server. pages/ gives the router; every page is prerendered.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: true,
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/main.scss', '~/assets/oculus-tokens.scss'],
  alias: {
    // type-only import of the API app (never bundled), the shared schema and the shared day helpers
    '#api-type': fileURLToPath(new URL('../nexus-api/src/app.ts', import.meta.url)),
    '#life-schema': fileURLToPath(new URL('../nexus-shared/life-calendar.ts', import.meta.url)),
    '#oculus-schema': fileURLToPath(new URL('../nexus-shared/oculus.ts', import.meta.url)),
    '#days': fileURLToPath(new URL('../nexus-shared/days.ts', import.meta.url)),
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: SITE === 'oculus' ? 'DigiSmith Oculus' : 'pazurite',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'robots', content: 'noindex' },
      ],
    },
  },
  hooks: {
    'pages:extend': (pages) => sitePages(pages, SITE),
    // the Life build must not carry the Oculus layout (it pulls in the Oculus API client)
    'app:resolve': (app) => { if (SITE === 'life') delete app.layouts.oculus },
  },
  // each site has its own output folder, so both builds can sit side by side for the tests and build-www.sh
  nitro: { output: { dir: SITE === 'oculus' ? '.output-oculus' : '.output' }, prerender: { routes: ROUTES } },
  experimental: { payloadExtraction: false },   // no payload files: the page requests nothing at load except the API
  typescript: { strict: true },
})
