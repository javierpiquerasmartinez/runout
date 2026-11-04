import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { RunningApp } from './app.js';
import { newAccount } from './google.js';

/** The email every e2e Administrator has; pass it to `startApp`. */
export const ADMINISTRATOR_EMAIL = 'admin@runout.test';

/** Signs the Administrator in (made the Test mode way): their token and id. */
export function signInAdministrator(
  running: RunningApp,
): Promise<{ token: string; id: string }> {
  return newAccount(running.httpServer, 'administrator', ADMINISTRATOR_EMAIL);
}

/** Sends an Invitation from the panel, answering with its link's token from the inbox. */
export async function invite(
  running: RunningApp,
  administratorToken: string,
  email: string,
  language: 'es' | 'en' = 'es',
): Promise<string> {
  await request(running.httpServer)
    .post('/api/admin/invitations')
    .set('Authorization', `Bearer ${administratorToken}`)
    .send({ email, language })
    .expect(201);
  return running.inbox.token(email, 'invitation');
}

export const GOOD_PASSWORD = 'a long passphrase of mine';

/** Invites `email` and accepts with a password: the new Account's token and id. */
export async function invitedAccount(
  running: RunningApp,
  administratorToken: string,
  email: string,
  password = GOOD_PASSWORD,
): Promise<{ token: string; id: string }> {
  const token = await invite(running, administratorToken, email);
  const res = await request(running.httpServer)
    .post(`/api/invitations/${token}/password`)
    .send({ password })
    .expect(201);
  return {
    token: res.body.token as string,
    id: res.body.identity.id as string,
  };
}

/** An email no other test uses: the e2e database is shared by every test of a run. */
export function uniqueEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}@example.com`;
}
