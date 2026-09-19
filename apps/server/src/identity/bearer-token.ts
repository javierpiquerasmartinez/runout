/** Reads the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}
