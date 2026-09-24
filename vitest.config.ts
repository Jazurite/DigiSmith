import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // packages/clickup-client's dist/ is gitignored and only produced by its own
      // build script, so point test runs straight at its source instead of requiring
      // a build before tests can run.
      '@digismith/clickup-client': fileURLToPath(
        new URL('./packages/clickup-client/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/worktrees/**',
      '**/.worktrees/**',
      '**/worktrees/**',
    ],
  },
})
