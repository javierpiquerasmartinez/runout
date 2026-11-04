import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { newAccount } from './support/google.js';

describe('The Administrator role (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp({
      // Listed in another case, as the environment might have it.
      administratorEmails: [
        ADMINISTRATOR_EMAIL.toUpperCase(),
        'other@runout.test',
      ],
    });
  });

  afterEach(async () => {
    await running.close();
  });

  const me = (token: string) =>
    request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`);

  it('marks the Accounts whose emails are configured as Administrators, ignoring case', async () => {
    const administrator = await signInAdministrator(running);
    const ana = await newAccount(running.httpServer);

    expect((await me(administrator.token).expect(200)).body.administrator).toBe(
      true,
    );
    expect((await me(ana.token).expect(200)).body.administrator).toBe(false);
  });

  it('lets an Administrator into the panel', async () => {
    const administrator = await signInAdministrator(running);

    await request(running.httpServer)
      .get('/api/admin/invitations')
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(200);
  });

  it('answers not-found to anyone else: an Account, an anonymous identity, no token', async () => {
    const ana = await newAccount(running.httpServer);
    const { body: room } = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ name: 'Martes', displayName: 'Ana' })
      .expect(201);
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${room.code}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);
    expect((await me(guest.body.token).expect(200)).body.administrator).toBe(
      false,
    );

    for (const token of [
      ana.token,
      guest.body.token as string,
      'not-a-token',
      undefined,
    ]) {
      for (const path of [
        '/api/admin/invitations',
        '/api/admin/accounts',
        '/api/admin/rooms',
      ]) {
        const req = request(running.httpServer).get(path);
        if (token) req.set('Authorization', `Bearer ${token}`);
        const res = await req.expect(404);
        expect(res.body).toEqual({ reason: 'not-found' });
      }
    }
  });

  it('follows the configuration, not anything stored: it takes effect without touching the database', async () => {
    const administrator = await signInAdministrator(running);
    await running.close();
    running = await startApp({ administratorEmails: [] });

    // The same Account, signed in again on a server configured without it.
    const again = await signInAdministrator(running);
    expect(again.id).toBe(administrator.id);
    expect((await me(again.token).expect(200)).body.administrator).toBe(false);
    await request(running.httpServer)
      .get('/api/admin/invitations')
      .set('Authorization', `Bearer ${again.token}`)
      .expect(404);
  });
});
