import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { googleIdToken } from './support/google.js';

describe('Accounts with Google (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function signInWith(idToken: string) {
    return request(running.httpServer)
      .post('/api/sessions/google')
      .send({ idToken });
  }

  it('creates an Account on the first sign-in, still without a Display Name', async () => {
    const res = await signInWith(
      googleIdToken('ana-subject', 'ana@example.com'),
    ).expect(201);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.token.length).toBeGreaterThanOrEqual(32);
    expect(res.body.identity).toEqual({
      id: expect.any(String),
      displayName: null,
      screenNames: [],
      preferences: expect.any(Object),
      account: { email: 'ana@example.com' },
      room: null,
    });
  });

  function me(token: string) {
    return request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`);
  }

  it('finds the same Account on every later sign-in, from any browser', async () => {
    const laptop = await signInWith(googleIdToken('ana-subject')).expect(201);
    await request(running.httpServer)
      .put('/api/identities/me/display-name')
      .set('Authorization', `Bearer ${laptop.body.token}`)
      .send({ displayName: 'Ana' })
      .expect(200);

    const phone = await signInWith(googleIdToken('ana-subject')).expect(201);

    expect(phone.body.token).not.toBe(laptop.body.token);
    expect(phone.body.identity).toMatchObject({
      id: laptop.body.identity.id,
      displayName: 'Ana',
    });
    // Both browsers stay signed in.
    await me(laptop.body.token).expect(200);
    await me(phone.body.token).expect(200);
  });

  it('gives different Google accounts different Accounts', async () => {
    const ana = await signInWith(googleIdToken('ana-subject')).expect(201);
    const bea = await signInWith(googleIdToken('bea-subject')).expect(201);

    expect(bea.body.identity.id).not.toBe(ana.body.identity.id);
  });

  it('refuses an ID token Google did not issue, with a typed reason', async () => {
    const forged = await signInWith('not-a-google-token').expect(401);
    expect(forged.body).toMatchObject({ reason: 'invalid-google-token' });

    const missing = await request(running.httpServer)
      .post('/api/sessions/google')
      .send({})
      .expect(401);
    expect(missing.body).toMatchObject({ reason: 'invalid-google-token' });
  });

  it("signing out ends that browser's session only", async () => {
    const laptop = await signInWith(googleIdToken('ana-subject')).expect(201);
    const phone = await signInWith(googleIdToken('ana-subject')).expect(201);

    await request(running.httpServer)
      .delete('/api/sessions/current')
      .set('Authorization', `Bearer ${laptop.body.token}`)
      .expect(204);

    const after = await me(laptop.body.token).expect(401);
    expect(after.body).toMatchObject({ reason: 'unauthenticated' });
    await me(phone.body.token).expect(200);
  });

  it('refuses to sign out a token it does not know', async () => {
    const res = await request(running.httpServer)
      .delete('/api/sessions/current')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(res.body).toMatchObject({ reason: 'unauthenticated' });
  });
});
