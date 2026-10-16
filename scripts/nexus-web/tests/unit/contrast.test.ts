import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scss = readFileSync(join(__dirname, '../../app/assets/main.scss'), 'utf8')
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]))
}
const light = tokens(scss.slice(scss.indexOf(':root {'), scss.indexOf('@media (min-width')))
const dark = tokens(scss.slice(scss.indexOf('@media (prefers-color-scheme: dark)'), scss.indexOf(':root[data-theme=\'dark\']')))
const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe.each([['light', light], ['dark', dark]] as const)('contrast in %s (WCAG 2.2 AA)', (_name, t) => {
  it('has all the tokens', () => { for (const k of ['bg', 'ink', 'ink-2', 'line', 'ahead', 'accent', 'accent-text']) expect(t[k], k).toBeDefined() })
  it('text is at least 4.5:1 on the page', () => {
    for (const k of ['ink', 'ink-2', 'accent-text']) expect(ratio(t[k], t.bg), `${k} on bg`).toBeGreaterThanOrEqual(4.5)
  })
  it('the ahead outline and the this-week box are at least 3:1 on the page (non-text)', () => {
    for (const k of ['ahead', 'accent']) expect(ratio(t[k], t.bg), `${k} on bg`).toBeGreaterThanOrEqual(3)
  })
  it('a lived box (ink) and this week (accent) are told apart by more than colour: ratio between them is above 1.5 as a second guard', () => {
    expect(ratio(t.ink, t.accent)).toBeGreaterThanOrEqual(1.5)
  })
})
