export interface Cell { row: number; box: number }
const BOXES = 52

// The Designer's keys (ui-design.md section 8). null = not a grid key.
export function nextCell(key: string, ctrl: boolean, cur: Cell, rows: number): Cell | null {
  const last = rows - 1
  const clampRow = (r: number) => Math.max(0, Math.min(last, r))
  switch (key) {
    case 'ArrowRight': return cur.box < BOXES - 1 ? { row: cur.row, box: cur.box + 1 } : cur.row < last ? { row: cur.row + 1, box: 0 } : cur
    case 'ArrowLeft': return cur.box > 0 ? { row: cur.row, box: cur.box - 1 } : cur.row > 0 ? { row: cur.row - 1, box: BOXES - 1 } : cur
    case 'ArrowDown': return { row: clampRow(cur.row + 1), box: cur.box }
    case 'ArrowUp': return { row: clampRow(cur.row - 1), box: cur.box }
    case 'Home': return ctrl ? { row: 0, box: 0 } : { row: cur.row, box: 0 }
    case 'End': return ctrl ? { row: last, box: BOXES - 1 } : { row: cur.row, box: BOXES - 1 }
    case 'PageDown': return { row: clampRow(cur.row + 10), box: cur.box }
    case 'PageUp': return { row: clampRow(cur.row - 10), box: cur.box }
    default: return null
  }
}

// Touch: a 5 px box is smaller than a finger, so look for the nearest box within `radius` px, nearest ring first.
export function nearestBox(x: number, y: number, probe: (x: number, y: number) => Element | null, radius = 14): Element | null {
  const direct = probe(x, y)
  if (direct) return direct
  for (let r = 3.5; r <= radius; r += 3.5) {
    for (let a = 0; a < 8; a++) {
      const px = Math.round(x + r * Math.cos((a * Math.PI) / 4)), py = Math.round(y + r * Math.sin((a * Math.PI) / 4))
      if (Math.hypot(px - x, py - y) > radius) continue   // rounding must not push a probe past the radius
      const el = probe(px, py)
      if (el) return el
    }
  }
  return null
}
