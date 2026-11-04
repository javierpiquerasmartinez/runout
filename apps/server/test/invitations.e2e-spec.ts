import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  GOOD_PASSWORD,
  invite,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { googleIdToken, newAccount } from './support/google.js';

const DAY = 24 * 3_600_000;

describe('Invitations (e2e)', () => {
  let running: RunningApp;
  let administrator: string;
  let ana: string;
  let bea: string;
  let stranger: string;
  let old: string;

  beforeEach(async () => {
    [ana, bea, stranger, old] = ['ana', 'bea', 'stranger', 'old'].map(
      uniqueEmail,
    );
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = (await signInAdministrator(running)).token;
  });

  afterEach(async () => {
    await running.close();
  });

  const panel = () => ({
    get: (path: string) =>
      request(running.httpServer)
        .get(`/api/admin${path}`)
        .set('Authorization', `Bearer ${administrator}`),
    post: (path: string) =>
      request(running.httpServer)
        .post(`/api/admin${path}`)
        .set('Authorization', `Bearer ${administrator}`),
  });

  async function invitationOf(email: string) {
    const { body } = await panel().get('/invitations').expect(200);
    return (body as { email: string }[]).find(
      (each) => each.email === email,
    ) as any;
  }

  describe('sending', () => {
    it('emails a link with who invited them and when it expires, and lists it as pending', async () => {
      await request(running.httpServer)
        .put('/api/identities/me/display-name')
        .set('Authorization', `Bearer ${administrator}`)
        .send({ displayName: 'Javier' })
        .expect(200);

      const res = await panel()
        .post('/invitations')
        .send({ email: ` ${ana.toUpperCase()} `, language: 'en' })
        .expect(201);

      expect(res.body.emailSent).toBe(true);
      const email = running.inbox.last(ana);
      expect(email.subject).toBe("You're invited to Runout");
      expect(email.text).toContain('Javier has invited you');
      expect(email.text).toContain('8 January 2026');
      expect(email.html).toContain('http://localhost:5173/invitation/');
      expect(await invitationOf(ana)).toMatchObject({
        email: ana,
        language: 'en',
        status: 'pending',
        sentBy: { email: ADMINISTRATOR_EMAIL, displayName: 'Javier' },
        sentAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-08T00:00:00.000Z',
        account: null,
      });
    });

    it('writes it in Spanish unless told otherwise', async () => {
      await panel().post('/invitations').send({ email: bea }).expect(201);

      expect(running.inbox.last(bea).subject).toBe('Te han invitado a Runout');
      expect((await invitationOf(bea)).language).toBe('es');
    });

    it('shows the invited email and status to whoever opens the link', async () => {
      const token = await invite(running, administrator, ana);

      const res = await request(running.httpServer)
        .get(`/api/invitations/${token}`)
        .expect(200);
      expect(res.body).toEqual({ email: ana, status: 'pending' });
      await request(running.httpServer)
        .get('/api/invitations/unknown')
        .expect(404);
    });

    it('expires after 7 days', async () => {
      const token = await invite(running, administrator, ana);

      await running.clock.advance(7 * DAY);

      expect((await invitationOf(ana)).status).toBe('expired');
      const res = await request(running.httpServer)
        .get(`/api/invitations/${token}`)
        .expect(200);
      expect(res.body.status).toBe('expired');
    });

    it('refuses a second one to an email with a pending Invitation, pointing to resend', async () => {
      await invite(running, administrator, ana);

      const res = await panel()
        .post('/invitations')
        .send({ email: ana.toUpperCase() })
        .expect(409);

      expect(res.body).toMatchObject({
        reason: 'invitation-pending',
        invitationId: (await invitationOf(ana)).id,
      });
      expect(running.inbox.to(ana)).toHaveLength(1);
    });

    it('refuses an email that already has an Account', async () => {
      await newAccount(running.httpServer, `p-${ana}`, ana);

      const res = await panel()
        .post('/invitations')
        .send({ email: ana })
        .expect(409);

      expect(res.body).toMatchObject({
        reason: 'account-exists',
        suspended: false,
      });
      expect(running.inbox.to(ana)).toHaveLength(0);
    });

    it('refuses what is not an email address', async () => {
      const res = await panel()
        .post('/invitations')
        .send({ email: 'ana' })
        .expect(400);
      expect(res.body.reason).toBe('invalid-email');
    });

    it('keeps it pending when the email fails, so it can be resent', async () => {
      running.inbox.failNext();

      const res = await panel()
        .post('/invitations')
        .send({ email: ana })
        .expect(201);

      expect(res.body.emailSent).toBe(false);
      expect((await invitationOf(ana)).status).toBe('pending');
      const again = await panel()
        .post(`/invitations/${res.body.invitation.id}/resend`)
        .expect(200);
      expect(again.body.emailSent).toBe(true);
      expect(running.inbox.to(ana)).toHaveLength(1);
    });
  });

  describe('resending and cancelling', () => {
    it('resends with a new link and a fresh 7 days; the old link stops working', async () => {
      const old = await invite(running, administrator, ana);
      await running.clock.advance(8 * DAY);
      const { id } = await invitationOf(ana);

      await panel().post(`/invitations/${id}/resend`).expect(200);

      const fresh = running.inbox.token(ana, 'invitation');
      expect(fresh).not.toBe(old);
      expect(await invitationOf(ana)).toMatchObject({
        status: 'pending',
        expiresAt: '2026-01-16T00:00:00.000Z',
      });
      const stale = await request(running.httpServer)
        .post(`/api/invitations/${old}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(404);
      expect(stale.body.reason).toBe('invitation-not-found');
      await request(running.httpServer)
        .post(`/api/invitations/${fresh}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(201);
    });

    it('cancels a pending one: its link says it was cancelled', async () => {
      const token = await invite(running, administrator, ana);
      const { id } = await invitationOf(ana);

      await panel().post(`/invitations/${id}/cancel`).expect(200);

      expect((await invitationOf(ana)).status).toBe('cancelled');
      const res = await request(running.httpServer)
        .post(`/api/invitations/${token}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(410);
      expect(res.body.reason).toBe('invitation-cancelled');
      // A cancelled one leaves room for a new Invitation.
      await panel().post('/invitations').send({ email: ana }).expect(201);
    });
  });

  describe('accepting with a password', () => {
    it('creates the Account with the invited email, signed in and in the Invitation’s language', async () => {
      const token = await invite(running, administrator, ana, 'en');

      const res = await request(running.httpServer)
        .post(`/api/invitations/${token}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(201);

      expect(res.body.identity).toMatchObject({
        displayName: null,
        account: { email: ana, signInMethods: ['password'] },
        preferences: { language: 'en' },
        administrator: false,
      });
      await request(running.httpServer)
        .get('/api/library/hands')
        .set('Authorization', `Bearer ${res.body.token}`)
        .expect(200);
      expect(await invitationOf(ana)).toMatchObject({
        status: 'accepted',
        acceptedAt: '2026-01-01T00:00:00.000Z',
        account: { id: res.body.identity.id, email: ana },
      });
    });

    it('refuses a short or common password, creating nothing', async () => {
      const token = await invite(running, administrator, ana);

      for (const password of ['short one', 'PasswordPassword']) {
        const res = await request(running.httpServer)
          .post(`/api/invitations/${token}/password`)
          .send({ password })
          .expect(400);
        expect(res.body.reason).toBe('password-too-weak');
      }
      expect((await invitationOf(ana)).status).toBe('pending');
    });

    it('works once: a used link says so', async () => {
      const token = await invite(running, administrator, ana);
      await request(running.httpServer)
        .post(`/api/invitations/${token}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(201);

      const res = await request(running.httpServer)
        .post(`/api/invitations/${token}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(410);
      expect(res.body.reason).toBe('invitation-used');
    });

    it('refuses an expired or unknown link, each saying which', async () => {
      const token = await invite(running, administrator, ana);
      await running.clock.advance(7 * DAY + 1);

      const expired = await request(running.httpServer)
        .post(`/api/invitations/${token}/password`)
        .send({ password: GOOD_PASSWORD })
        .expect(410);
      expect(expired.body.reason).toBe('invitation-expired');
      const unknown = await request(running.httpServer)
        .post('/api/invitations/nothing-like-it/password')
        .send({ password: GOOD_PASSWORD })
        .expect(404);
      expect(unknown.body.reason).toBe('invitation-not-found');
    });
  });

  describe('accepting with Google', () => {
    it('creates the Account when Google says the invited email', async () => {
      const token = await invite(running, administrator, ana);

      const res = await request(running.httpServer)
        .post(`/api/invitations/${token}/google`)
        .send({ idToken: googleIdToken(`g-${ana}`, ana.toUpperCase()) })
        .expect(201);

      expect(res.body.identity.account).toEqual({
        email: ana,
        signInMethods: ['google'],
      });
      // From then on, plain Google sign-in reaches it.
      const again = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${ana}`, ana) })
        .expect(201);
      expect(again.body.identity.id).toBe(res.body.identity.id);
    });

    it('refuses another Google account, saying which email was invited', async () => {
      const token = await invite(running, administrator, ana);

      const res = await request(running.httpServer)
        .post(`/api/invitations/${token}/google`)
        .send({ idToken: googleIdToken(`g-${bea}`, bea) })
        .expect(403);

      expect(res.body).toEqual({
        reason: 'invitation-email-mismatch',
        email: ana,
      });
      expect((await invitationOf(ana)).status).toBe('pending');
    });
  });

  describe('Google sign-in without an Invitation', () => {
    it('is refused for an unknown Google account, and creates nothing', async () => {
      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${stranger}`, stranger) })
        .expect(403);

      expect(res.body.reason).toBe('invitation-required');
      const accounts = await panel()
        .get(`/accounts?search=${encodeURIComponent(stranger)}`)
        .expect(200);
      expect(accounts.body.total).toBe(0);
    });

    it('links Google to an Account created with a password, so both reach it', async () => {
      const account = await invitedAccount(running, administrator, ana);

      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${ana}`, ana) })
        .expect(201);

      expect(res.body.identity).toMatchObject({
        id: account.id,
        account: { signInMethods: ['google', 'password'] },
      });
      await request(running.httpServer)
        .post('/api/sessions/password')
        .send({ email: ana, password: GOOD_PASSWORD })
        .expect(201);
    });

    it('refuses a Google account whose email another Account already has, never merging them', async () => {
      await newAccount(running.httpServer, `g-${ana}`, ana);
      await newAccount(running.httpServer, `g-${bea}`, bea);

      // Bea's Google account now says Ana's email.
      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${bea}`, ana) })
        .expect(409);

      expect(res.body.reason).toBe('email-taken');
    });

    it('still signs in an Account that existed before Invitations', async () => {
      // Made the Test mode way, as Accounts from before had no Invitation either.
      const before = await newAccount(running.httpServer, `g-${old}`, old);

      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${old}`, old) })
        .expect(201);
      expect(res.body.identity.id).toBe(before.id);
    });
  });
});
