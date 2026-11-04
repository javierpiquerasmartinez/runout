import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  GOOD_PASSWORD,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';

const MINUTE = 60_000;

describe('Impersonation (e2e)', () => {
  let running: RunningApp;
  let administrator: { token: string; id: string };
  let email: string;
  let ana: { token: string; id: string };

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = await signInAdministrator(running);
    email = uniqueEmail('ana');
    ana = await invitedAccount(running, administrator.token, email);
  });

  afterEach(async () => {
    await running.close();
  });

  const as = (token: string) => ({
    get: (path: string) =>
      request(running.httpServer)
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(running.httpServer)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    put: (path: string) =>
      request(running.httpServer)
        .put(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(running.httpServer)
        .delete(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  async function impersonate(accountId = ana.id) {
    const res = await as(administrator.token)
      .post(`/admin/accounts/${accountId}/impersonations`)
      .expect(201);
    return res.body as {
      token: string;
      identity: { id: string; impersonation: unknown };
    };
  }

  async function row() {
    const { body } = await as(administrator.token)
      .get(`/admin/accounts?search=${encodeURIComponent(email)}`)
      .expect(200);
    return body.accounts[0];
  }

  it('acts as the Account in its Library, Lab and Settings, saying who is behind it', async () => {
    const preview = await as(ana.token)
      .post('/library/imports/previews')
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    await as(ana.token)
      .post('/library/imports')
      .send({ previews: [preview.body.id] })
      .expect(201);

    const { token, identity } = await impersonate();

    expect(identity).toMatchObject({
      id: ana.id,
      administrator: false,
      impersonation: {
        administrator: { email: ADMINISTRATOR_EMAIL },
        endsAt: '2026-01-01T01:00:00.000Z',
      },
    });
    expect((await as(token).get('/library/hands').expect(200)).body.total).toBe(
      4,
    );
    await as(token)
      .post('/lab/ranges')
      .send({ name: 'Fixed for Ana', combos: { AsKs: 100 } })
      .expect(201);
    await as(token)
      .put('/identities/me/display-name')
      .send({ displayName: 'Ana' })
      .expect(200);
    expect(
      (await as(ana.token).get('/lab/ranges').expect(200)).body,
    ).toHaveLength(1);
  });

  it('refuses Rooms, passwords, sign-in methods and the panel', async () => {
    const { token } = await impersonate();
    const { body: room } = await as(ana.token)
      .post('/rooms')
      .send({ name: 'Martes', displayName: 'Ana' })
      .expect(201);

    const refusals = [
      as(token).post('/rooms').send({ name: 'Martes', displayName: 'Ana' }),
      as(token).get(`/rooms/${room.code}`),
      as(token)
        .post('/identities/me/password')
        .send({ password: GOOD_PASSWORD }),
      as(token).put('/identities/me/password').send({
        currentPassword: GOOD_PASSWORD,
        password: 'a brand new passphrase',
      }),
      as(token).get('/admin/accounts'),
    ];
    for (const refused of refusals) {
      const res = await refused.expect(403);
      expect(res.body.reason).toBe('impersonation-not-allowed');
    }
    const socket = await RoomClient.connect(running.wsUrl, token);
    socket.send('room.join', { code: room.code, displayName: 'Ana' });
    expect(await socket.next('rejected')).toEqual({
      command: 'room.join',
      reason: 'impersonation-not-allowed',
    });
    await socket.close();
  });

  it('ends with "Salir", recorded on the Account’s row, the Administrator still signed in', async () => {
    const { token } = await impersonate();
    await running.clock.advance(10 * MINUTE);

    await as(token).delete('/sessions/current').expect(204);

    await as(token).get('/identities/me').expect(401);
    await as(administrator.token).get('/admin/accounts').expect(200);
    expect((await row()).impersonations).toEqual([
      {
        administrator: expect.objectContaining({ id: administrator.id }),
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: '2026-01-01T00:10:00.000Z',
      },
    ]);
  });

  it('ends on its own after one hour', async () => {
    const { token } = await impersonate();
    await running.clock.advance(59 * MINUTE);
    await as(token).get('/identities/me').expect(200);

    await running.clock.advance(MINUTE);

    await as(token).get('/identities/me').expect(401);
    expect((await row()).impersonations[0].endedAt).toBe(
      '2026-01-01T01:00:00.000Z',
    );
  });

  it('leaves the Account’s own Sign-ins and last activity untouched', async () => {
    await as(ana.token).get('/identities/me').expect(200);
    const { token } = await impersonate();
    await running.clock.advance(30 * MINUTE);

    await as(token).get('/library/hands').expect(200);
    await as(token).delete('/sessions/current').expect(204);

    expect((await row()).lastActiveAt).toBe('2026-01-01T00:00:00.000Z');
    await as(ana.token).get('/identities/me').expect(200);
  });

  it('ends with a Suspension, recorded at that moment', async () => {
    const { token } = await impersonate();
    await running.clock.advance(20 * MINUTE);

    await as(administrator.token)
      .post(`/admin/accounts/${ana.id}/suspension`)
      .expect(204);

    await as(token).get('/identities/me').expect(401);
    expect((await row()).impersonations[0].endedAt).toBe(
      '2026-01-01T00:20:00.000Z',
    );
  });

  it('never impersonates an Administrator or a suspended Account', async () => {
    const self = await as(administrator.token)
      .post(`/admin/accounts/${administrator.id}/impersonations`)
      .expect(403);
    expect(self.body.reason).toBe('cannot-impersonate-administrator');

    await as(administrator.token)
      .post(`/admin/accounts/${ana.id}/suspension`)
      .expect(204);
    const suspended = await as(administrator.token)
      .post(`/admin/accounts/${ana.id}/impersonations`)
      .expect(403);
    expect(suspended.body.reason).toBe('account-suspended');
  });
});
