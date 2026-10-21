/** A whole number from a query string, within bounds, or the fallback. */
export function boundedInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
