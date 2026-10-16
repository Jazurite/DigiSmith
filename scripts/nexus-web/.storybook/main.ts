import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook-vue/nuxt'

// The component docgen writes each component's absolute source path into the bundle (`sourceFiles: ['/Users/.../X.vue']`).
// Strip the repo root from every built chunk, so the published Storybook never carries a build-machine path (build-www.sh scans for it).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y'],   // the panel for Jack; the failing gate is the axe run in Playwright (task 16)
  framework: { name: '@storybook-vue/nuxt', options: {} },
  core: { disableTelemetry: true },
  viteFinal: async (cfg) => {
    cfg.plugins = [...(cfg.plugins ?? []), { name: 'strip-build-paths', enforce: 'post', renderChunk: (code: string) => (code.includes(REPO_ROOT) ? { code: code.split(`${REPO_ROOT}/`).join('').split(REPO_ROOT).join(''), map: null } : null) }]
    return cfg
  },
}
export default config
