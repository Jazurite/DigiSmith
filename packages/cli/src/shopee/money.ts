// Shopee sends amounts times 100000.
export function toVnd(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw / 100000;
}
