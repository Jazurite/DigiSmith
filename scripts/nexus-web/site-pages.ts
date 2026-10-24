// DGS-599: one Nuxt project, two static sites. life = pazurite.com (the Life Calendar), oculus = oculus.pazurite.com (served at its root).
export type Site = 'life' | 'oculus'
export interface PageLike { path: string; file?: string; children?: PageLike[] }

export const siteOf = (env: NodeJS.ProcessEnv): Site => (env.NEXUS_SITE === 'oculus' ? 'oculus' : 'life')

const isOculus = (p: PageLike): boolean => /[\\/]pages[\\/]oculus[\\/]/.test(p.file ?? '')

/** Keeps only this site's pages (in place, as the pages:extend hook needs). Oculus pages lose their /oculus prefix. */
export function sitePages(pages: PageLike[], site: Site): void {
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i]!
    if (isOculus(p) !== (site === 'oculus')) { pages.splice(i, 1); continue }
    if (site === 'oculus') p.path = p.path.replace(/^\/oculus(?=\/|$)/, '') || '/'
  }
}
