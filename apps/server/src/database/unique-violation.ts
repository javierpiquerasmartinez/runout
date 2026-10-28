/** Whether the database refused a write for breaking a unique index. */
export function isUniqueViolation(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if ((cause as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
