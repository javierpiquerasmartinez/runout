import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import type {
  GoogleAccount,
  GoogleVerifier,
} from '../../src/identity/google-verifier.js';

const PREFIX = 'fake-google-id-token';
const PERSONA_PREFIX = 'fake-persona-id-token';

/**
 * Stands in for Google: accepts the made-up ID tokens `googleIdToken` and
 * `personaIdToken` write and nothing else.
 */
export class FakeGoogleVerifier implements GoogleVerifier {
  verify(idToken: string): Promise<GoogleAccount | null> {
    const [prefix, subject, email] = idToken.split('|');
    if ((prefix !== PREFIX && prefix !== PERSONA_PREFIX) || !subject) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      subject,
      email: email || null,
      ...(prefix === PERSONA_PREFIX && { persona: true as const }),
    });
  }
}

/**
 * A made-up ID token for a Test mode persona: signing in with it creates its
 * Account without an Invitation, as Test mode does. For tests about anything
 * but how Accounts come to be.
 */
export function personaIdToken(
  subject: string,
  email = `${subject}@example.com`,
): string {
  return [PERSONA_PREFIX, subject, email].join('|');
}

/** A made-up ID token for the Google account `subject`, as Google would sign it. */
export function googleIdToken(
  subject: string,
  email = `${subject}@example.com`,
): string {
  return [PREFIX, subject, email].join('|');
}

/**
 * Signs in as an Account (a fresh one unless `subject` is given), made the
 * way Test mode makes them, without an Invitation: the bearer token the app
 * answered with and the Account's id.
 */
export async function newAccount(
  httpServer: Server,
  subject: string = randomUUID(),
  email = `${subject}@example.com`,
): Promise<{ token: string; id: string }> {
  const res = await request(httpServer)
    .post('/api/sessions/google')
    .send({ idToken: personaIdToken(subject, email) })
    .expect(201);
  return {
    token: res.body.token as string,
    id: res.body.identity.id as string,
  };
}
