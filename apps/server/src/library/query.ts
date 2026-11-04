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

/** A whole number from a query string, or null. */
export function wholeNumber(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
