module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node --experimental-strip-types tests/e2e/serve-stub-cli.ts',
      startServerReadyPattern: 'stub listening',
      url: ['http://127.0.0.1:4390/', 'http://127.0.0.1:4391/', 'http://127.0.0.1:4391/runs/'],
      numberOfRuns: 3,
      settings: { onlyCategories: ['performance'], chromeFlags: '--no-sandbox --headless=new' },   // Lighthouse's default mobile profile (slow 4G, 4x CPU)
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        // Lighthouse's navigation run has no INP; Total Blocking Time is the lab stand-in. The real INP is in tests/perf/vitals.spec.ts.
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/mobile' },   // local files only: nothing is uploaded anywhere
  },
}
