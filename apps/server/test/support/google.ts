import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import type {
  GoogleAccount,
  GoogleVerifier,
} from '../../src/identity/google-verifier.js';

const PREFIX = 'fake-google-id-token';

/**
 * Stands in for Google: accepts the made-up ID tokens `googleIdToken` writes
 * and nothing else.
 */
export class FakeGoogleVerifier implements GoogleVerifier {
  verify(idToken: string): Promise<GoogleAccount | null> {
    const [prefix, subject, email] = idToken.split('|');
    if (prefix !== PREFIX || !subject) return Promise.resolve(null);
    return Promise.resolve({ subject, email: email || null });
  }
}

/** A made-up ID token for the Google account `subject`, as Google would sign it. */
export function googleIdToken(
  subject: string,
  email = `${subject}@example.com`,
): string {
  return [PREFIX, subject, email].join('|');
}

/**
 * Signs in as a Google account (a fresh one unless `subject` is given): the
 * bearer token the app answered with and the Account's id.
 */
export async function newAccount(
  httpServer: Server,
  subject: string = randomUUID(),
): Promise<{ token: string; id: string }> {
  const res = await request(httpServer)
    .post('/api/sessions/google')
    .send({ idToken: googleIdToken(subject) })
    .expect(201);
  return {
    token: res.body.token as string,
    id: res.body.identity.id as string,
  };
}
