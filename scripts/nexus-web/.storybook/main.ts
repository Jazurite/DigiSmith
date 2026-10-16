import type { StorybookConfig } from '@storybook-vue/nuxt'

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y'],   // the panel for Jack; the failing gate is the axe run in Playwright (task 16)
  framework: { name: '@storybook-vue/nuxt', options: {} },
  core: { disableTelemetry: true },
}
export default config
