const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` can be compared with a uuid column without Postgres refusing it. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
