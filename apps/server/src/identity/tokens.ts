import { createHash, randomBytes } from 'node:crypto';

/** A new secret for a bearer token or an emailed link: 256 random bits. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What is stored in place of a token: its SHA-256, so the database never holds one. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** An email address as Runout keeps it: trimmed and lower-case. */
export function normalEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  // Something@somewhere.tld, without spaces; the email itself is the real check.
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}
