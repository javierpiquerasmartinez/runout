/** An error's message, for a log line; whatever else was thrown, as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
