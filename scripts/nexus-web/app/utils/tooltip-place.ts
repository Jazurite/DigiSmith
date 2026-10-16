const OFFSET = 14

// Mouse tooltip: 14 px up and right of the pointer, flipped to stay inside the window.
export function placeTooltip(anchor: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }): { x: number; y: number } {
  let x = anchor.x + OFFSET
  let y = anchor.y - OFFSET - size.h
  if (x + size.w > view.w) x = anchor.x - OFFSET - size.w
  if (y < 0) y = anchor.y + OFFSET
  return { x: Math.max(0, Math.min(x, Math.max(0, view.w - size.w))), y: Math.max(0, Math.min(y, Math.max(0, view.h - size.h))) }
}
