import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  GOOD_PASSWORD,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { googleIdToken, newAccount } from './support/google.js';

const MINUTE = 60_000;

describe('Passwords (e2e)', () => {
  let running: RunningApp;
  let administrator: string;
  let ana: string;

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = (await signInAdministrator(running)).token;
    ana = uniqueEmail('ana');
  });

  afterEach(async () => {
    await running.close();
  });

  const signIn = (email: string, password: string) =>
    request(running.httpServer)
      .post('/api/sessions/password')
      .send({ email, password });

  const me = (token: string) =>
    request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`);

  describe('signing in', () => {
    it('signs in with the email, in any case, and its password', async () => {
      const account = await invitedAccount(running, administrator, ana);

      const res = await signIn(ana.toUpperCase(), GOOD_PASSWORD).expect(201);

      expect(res.body.identity.id).toBe(account.id);
      await me(res.body.token).expect(200);
    });

    it('answers a wrong password and an unknown email alike', async () => {
      await invitedAccount(running, administrator, ana);

      const wrong = await signIn(ana, 'not the password at all').expect(401);
      const unknown = await signIn(uniqueEmail('nobody'), GOOD_PASSWORD).expect(
        401,
      );

      expect(wrong.body).toEqual({ reason: 'invalid-credentials' });
      expect(unknown.body).toEqual({ reason: 'invalid-credentials' });
    });

    it('refuses an Account that signs in with Google only, the same way', async () => {
      await newAccount(running.httpServer, `g-${ana}`, ana);

      const res = await signIn(ana, GOOD_PASSWORD).expect(401);
      expect(res.body.reason).toBe('invalid-credentials');
    });
  });

  describe('slowing down failed attempts', () => {
    async function fail(email: string, times: number) {
      for (let i = 0; i < times; i += 1)
        await signIn(email, 'wrong password!!');
    }

    it('lets five failures go, then waits 1, 5, 15 and 60 minutes, saying until when', async () => {
      await invitedAccount(running, administrator, ana);
      await fail(ana, 5);

      const sixth = await signIn(ana, 'wrong password!!').expect(429);
      expect(sixth.body).toEqual({
        reason: 'too-many-attempts',
        retryAt: '2026-01-01T00:01:00.000Z',
      });
      // Even the right password waits.
      const waiting = await signIn(ana, GOOD_PASSWORD).expect(429);
      expect(waiting.body.retryAt).toBe('2026-01-01T00:01:00.000Z');

      for (const minutes of [5, 15, 60, 60]) {
        const at = running.clock.now().getTime();
        await running.clock.advance(60 * MINUTE);
        const res = await signIn(ana, 'wrong password!!').expect(429);
        expect(new Date(res.body.retryAt).getTime() - at - 60 * MINUTE).toBe(
          minutes * MINUTE,
        );
      }
    });

    it('lets the right password in once the wait is over, and starts counting afresh', async () => {
      await invitedAccount(running, administrator, ana);
      await fail(ana, 6);
      await running.clock.advance(MINUTE);

      await signIn(ana, GOOD_PASSWORD).expect(201);

      await fail(ana, 5);
      await signIn(ana, GOOD_PASSWORD).expect(201);
    });

    it('counts attempts made side by side one after another, so none slips past the wait', async () => {
      await invitedAccount(running, administrator, ana);

      const answers = await Promise.all(
        Array.from({ length: 8 }, () => signIn(ana, 'wrong password!!')),
      );

      const statuses = answers.map((res) => res.status).sort((a, b) => a - b);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429]);
      // The right password waits too.
      await signIn(ana, GOOD_PASSWORD).expect(429);
    });

    it('slows an email with no Account exactly the same', async () => {
      const nobody = uniqueEmail('nobody');
      await fail(nobody, 4);

      const fifth = await signIn(nobody, GOOD_PASSWORD).expect(401);
      expect(fifth.body.reason).toBe('invalid-credentials');
      const sixth = await signIn(nobody, GOOD_PASSWORD).expect(429);
      expect(sixth.body).toEqual({
        reason: 'too-many-attempts',
        retryAt: '2026-01-01T00:01:00.000Z',
      });
    });

    it('never slows Google sign-in', async () => {
      const account = await invitedAccount(running, administrator, ana);
      await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${ana}`, ana) })
        .expect(201);
      await fail(ana, 9);

      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${ana}`, ana) })
        .expect(201);
      expect(res.body.identity.id).toBe(account.id);
    });
  });

  describe('resetting a forgotten password', () => {
    const requestReset = (email: string) =>
      request(running.httpServer).post('/api/password-resets').send({ email });
    const complete = (token: string, password: string) =>
      request(running.httpServer)
        .post(`/api/password-resets/${token}`)
        .send({ password });

    it('answers the same for any email; only an Account’s gets the link, in its language', async () => {
      await invitedAccount(running, administrator, ana);
      const nobody = uniqueEmail('nobody');

      const known = await requestReset(ana).expect(202);
      const unknown = await requestReset(nobody).expect(202);

      expect(known.body).toEqual(unknown.body);
      expect(running.inbox.to(nobody)).toHaveLength(0);
      const email = running.inbox.last(ana);
      expect(email.subject).toBe('Elige una nueva contraseña de Runout');
      expect(email.text).toContain('/reset-password/');
    });

    it('sets the new password, ends every other Sign-in and signs this browser in', async () => {
      const laptop = await invitedAccount(running, administrator, ana);
      await requestReset(ana).expect(202);

      const res = await complete(
        running.inbox.token(ana, 'reset-password'),
        'a brand new passphrase',
      ).expect(201);

      expect(res.body.identity.id).toBe(laptop.id);
      await me(laptop.token).expect(401);
      await me(res.body.token).expect(200);
      await signIn(ana, GOOD_PASSWORD).expect(401);
      await signIn(ana, 'a brand new passphrase').expect(201);
    });

    it('works once and for one hour, and asking again invalidates the earlier link', async () => {
      await invitedAccount(running, administrator, ana);
      await requestReset(ana);
      const first = running.inbox.token(ana, 'reset-password');
      await requestReset(ana);
      const second = running.inbox.token(ana, 'reset-password');

      expect(
        (await complete(first, 'a brand new passphrase').expect(404)).body
          .reason,
      ).toBe('reset-not-found');
      await complete(second, 'a brand new passphrase').expect(201);
      expect(
        (await complete(second, 'another new passphrase').expect(410)).body
          .reason,
      ).toBe('reset-used');

      await requestReset(ana);
      const late = running.inbox.token(ana, 'reset-password');
      await running.clock.advance(60 * MINUTE);
      expect(
        (await complete(late, 'another new passphrase').expect(410)).body
          .reason,
      ).toBe('reset-expired');
    });

    it('follows the password rules', async () => {
      await invitedAccount(running, administrator, ana);
      await requestReset(ana);

      const res = await complete(
        running.inbox.token(ana, 'reset-password'),
        'too short',
      ).expect(400);
      expect(res.body.reason).toBe('password-too-weak');
    });

    it('lets a slowed email sign in right after', async () => {
      await invitedAccount(running, administrator, ana);
      for (let i = 0; i < 7; i += 1) await signIn(ana, 'wrong password!!');
      await requestReset(ana);
      await complete(
        running.inbox.token(ana, 'reset-password'),
        'a brand new passphrase',
      ).expect(201);

      await signIn(ana, 'a brand new passphrase').expect(201);
    });

    it('gives an Account that signs in with Google only its first password', async () => {
      await newAccount(running.httpServer, `g-${ana}`, ana);
      await requestReset(ana);
      await complete(
        running.inbox.token(ana, 'reset-password'),
        'a brand new passphrase',
      ).expect(201);

      await signIn(ana, 'a brand new passphrase').expect(201);
    });
  });

  it('tells the web what is wrong with a password while it is typed', async () => {
    const check = (password: string) =>
      request(running.httpServer)
        .post('/api/password-checks')
        .send({ password })
        .expect(200);

    expect((await check('short')).body).toEqual({ problem: 'too-short' });
    expect((await check('PASSWORDPASSWORD')).body).toEqual({
      problem: 'common',
    });
    expect((await check(GOOD_PASSWORD)).body).toEqual({ problem: null });
  });

  describe('in Settings', () => {
    it('lets a Google Account add a password, then sign in with it', async () => {
      const account = await newAccount(running.httpServer, `g-${ana}`, ana);

      const res = await request(running.httpServer)
        .post('/api/identities/me/password')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ password: GOOD_PASSWORD })
        .expect(201);

      expect(res.body.account.signInMethods).toEqual(['google', 'password']);
      await signIn(ana, GOOD_PASSWORD).expect(201);
      const twice = await request(running.httpServer)
        .post('/api/identities/me/password')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ password: GOOD_PASSWORD })
        .expect(409);
      expect(twice.body.reason).toBe('password-exists');
    });

    it('changes it given the current one; other browsers are signed out, this one stays', async () => {
      const laptop = await invitedAccount(running, administrator, ana);
      const phone = (await signIn(ana, GOOD_PASSWORD).expect(201)).body
        .token as string;
      const change = (currentPassword: string) =>
        request(running.httpServer)
          .put('/api/identities/me/password')
          .set('Authorization', `Bearer ${laptop.token}`)
          .send({ currentPassword, password: 'a brand new passphrase' });

      expect((await change('not my password!').expect(401)).body.reason).toBe(
        'invalid-credentials',
      );
      await me(phone).expect(200);

      await change(GOOD_PASSWORD).expect(200);

      await me(laptop.token).expect(200);
      await me(phone).expect(401);
      await signIn(ana, 'a brand new passphrase').expect(201);
    });

    it('tells the sign-in methods in the profile', async () => {
      const account = await invitedAccount(running, administrator, ana);
      expect((await me(account.token).expect(200)).body.account).toEqual({
        email: ana,
        signInMethods: ['password'],
      });
    });
  });
});
