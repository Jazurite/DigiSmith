// scripts/nexus-web/tests/unit/oculus-contrast.test.ts
// Every text/background pair of the Oculus tokens, light and dark. Read the colours from the SCSS, convert oklch to sRGB, check WCAG AA.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scss = readFileSync(join(__dirname, '../../app/assets/oculus-tokens.scss'), 'utf8')
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b, m_ = l - 0.1055613458 * a - 0.0638541728 * b, s_ = l - 0.0894841775 * a - 1.291485548 * b
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3]
  const lin = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S]
  return lin.map((x) => Math.min(1, Math.max(0, x))) as [number, number, number]   // linear sRGB, which is what luminance needs
}
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const ratio = (a: [number, number, number], b: [number, number, number]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
function tokens(block: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {}
  for (const m of block.matchAll(/--oc-([a-z0-9-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) out[m[1]] = oklchToRgb(Number(m[2]) / 100, Number(m[3]), Number(m[4]))
  return out
}
const dark = tokens(scss.slice(scss.indexOf('.oc {'), scss.indexOf('@mixin')))
const light = tokens(scss.slice(scss.indexOf('@mixin'), scss.indexOf('@media')))
const TEXT = ['text', 'text-2', 'text-3', 'primary', 'ok', 'warn', 'bad', 'info', 'neutral']
const GROUNDS = ['bg', 'surface', 'raised', 'hover', 'thead']   // hover rows and table heads carry text too

describe.each([['dark', { ...dark }], ['light', { ...dark, ...light }]] as const)('%s tokens', (_name, t) => {
  it.each(TEXT.flatMap((f) => GROUNDS.map((g) => [f, g] as const)))('%s on %s is at least 4.5:1', (f, g) => {
    expect(t[f], f).toBeDefined()
    expect(t[g], g).toBeDefined()
    expect(ratio(t[f], t[g])).toBeGreaterThanOrEqual(4.5)
  })
  it('strong borders against the surface are at least 1.3:1 (3:1 is not required for decoration)', () => {
    expect(ratio(t.strong, t.surface)).toBeGreaterThanOrEqual(1.3)
  })
})
