import { describe, expect, it } from 'vitest'
import { siteOf, sitePages, type PageLike } from './site-pages'

const pages = (): PageLike[] => [
  { path: '/', file: '/w/app/pages/index.vue' },
  { path: '/oculus', file: '/w/app/pages/oculus/index.vue' },
  { path: '/oculus/runs', file: '/w/app/pages/oculus/runs.vue' },
  { path: '/oculus/run', file: '/w/app/pages/oculus/run.vue' },
]
describe('sitePages', () => {
  it('life keeps only the Life pages', () => {
    const p = pages(); sitePages(p, 'life')
    expect(p.map((x) => x.path)).toEqual(['/'])
  })
  it('oculus keeps only the Oculus pages and serves them at the root', () => {
    const p = pages(); sitePages(p, 'oculus')
    expect(p.map((x) => x.path)).toEqual(['/', '/runs', '/run'])
  })
  it('a page path that only starts with "oculus" is not cut', () => {
    const p: PageLike[] = [{ path: '/oculusx', file: '/w/app/pages/oculus/x.vue' }]; sitePages(p, 'oculus')
    expect(p[0].path).toBe('/oculusx')
  })
  it('siteOf: oculus only for NEXUS_SITE=oculus, else life', () => {
    expect(siteOf({ NEXUS_SITE: 'oculus' })).toBe('oculus')
    expect(siteOf({})).toBe('life')
    expect(siteOf({ NEXUS_SITE: 'x' })).toBe('life')
  })
})
