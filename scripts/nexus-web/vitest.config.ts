import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
    include: ['*.test.ts', 'app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
})
