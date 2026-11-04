import request from 'supertest';
import { MASTER_GRACE_MS } from '../src/rooms/master-failover.js';
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
import { freshHandHistory } from './support/hand-histories.js';
import { freshDatabase } from './support/fresh-database.js';
import { RoomClient } from './support/room-client.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('The Accounts tab (e2e)', () => {
  let running: RunningApp;
  let administrator: { token: string; id: string };

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = await signInAdministrator(running);
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

  async function row(email: string) {
    const { body } = await as(administrator.token)
      .get(`/admin/accounts?search=${encodeURIComponent(email)}`)
      .expect(200);
    return body.accounts[0];
  }

  async function importHands(token: string) {
    const preview = await as(token)
      .post('/library/imports/previews')
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    await as(token)
      .post('/library/imports')
      .send({ previews: [preview.body.id] })
      .expect(201);
  }

  async function createRoom(token: string, displayName: string) {
    const { body } = await as(token)
      .post('/rooms')
      .send({ name: 'Martes', displayName })
      .expect(201);
    return body.code as string;
  }

  async function joined(token: string, code: string, displayName: string) {
    const socket = await RoomClient.connect(running.wsUrl, token);
    socket.send('room.join', { code, displayName });
    const snapshot = await socket.next('room.snapshot');
    return { socket, snapshot };
  }

  describe('statistics', () => {
    it('counts what each Account has and has done', async () => {
      const email = uniqueEmail('ana');
      const ana = await invitedAccount(running, administrator.token, email);
      await importHands(ana.token);
      await running.clock.advance(MINUTE);
      await importHands(ana.token);
      const { body: library } = await as(ana.token)
        .get('/library/hands')
        .expect(200);
      await as(ana.token)
        .post(`/library/hands/${library.hands[0].id}/notes`)
        .send({ body: 'Fold preflop' })
        .expect(201);
      await as(ana.token)
        .post('/library/tags')
        .send({ name: 'Multiway' })
        .expect(201);
      await as(ana.token)
        .post('/lab/ranges')
        .send({ name: 'OR BTN', combos: { AsKs: 100 } })
        .expect(201);
      await as(ana.token).post('/lab/tags').send({ name: 'BTN' }).expect(201);
      await createRoom(ana.token, 'Ana');
      const code = await createRoom(administrator.token, 'Admin');
      const { socket } = await joined(ana.token, code, 'Ana');
      await socket.close();

      expect(await row(email)).toMatchObject({
        email,
        displayName: 'Ana',
        createdAt: '2026-01-01T00:00:00.000Z',
        invitation: { sentBy: { email: ADMINISTRATOR_EMAIL } },
        signInMethods: ['password'],
        lastSignedInAt: '2026-01-01T00:00:00.000Z',
        administrator: false,
        suspension: null,
        counts: {
          libraryHands: 8,
          imports: 2,
          ranges: 1,
          libraryTags: 1,
          labTags: 1,
          notes: 1,
          roomsCreated: 1,
          roomsJoined: 2,
        },
        impersonations: [],
      });
    });

    it('records the last activity as requests come, every few minutes at most', async () => {
      const email = uniqueEmail('ana');
      const ana = await invitedAccount(running, administrator.token, email);
      await as(ana.token).get('/identities/me').expect(200);
      expect((await row(email)).lastActiveAt).toBe('2026-01-01T00:00:00.000Z');

      await running.clock.advance(MINUTE);
      await as(ana.token).get('/identities/me').expect(200);
      expect((await row(email)).lastActiveAt).toBe('2026-01-01T00:00:00.000Z');

      await running.clock.advance(10 * MINUTE);
      await as(ana.token).get('/library/hands').expect(200);
      expect((await row(email)).lastActiveAt).toBe('2026-01-01T00:11:00.000Z');
    });

    it('searches by email and Display Name, and sorts by the counts', async () => {
      const tag = uniqueEmail('sorting').split('@')[0];
      const few = await newAccount(
        running.httpServer,
        `few-${tag}`,
        `few-${tag}@example.com`,
      );
      const many = await newAccount(
        running.httpServer,
        `many-${tag}`,
        `many-${tag}@example.com`,
      );
      await importHands(many.token);
      await as(few.token)
        .put('/identities/me/display-name')
        .send({ displayName: `Bea ${tag}` })
        .expect(200);

      const byHands = await as(administrator.token)
        .get(`/admin/accounts?search=${tag}&sort=libraryHands&direction=desc`)
        .expect(200);
      expect(byHands.body.total).toBe(2);
      expect(
        byHands.body.accounts.map((each: { id: string }) => each.id),
      ).toEqual([many.id, few.id]);

      const byName = await as(administrator.token)
        .get(`/admin/accounts?search=Bea%20${tag}`)
        .expect(200);
      expect(
        byName.body.accounts.map((each: { id: string }) => each.id),
      ).toEqual([few.id]);

      await as(administrator.token)
        .get('/admin/accounts?sort=password')
        .expect(400);
    });

    it('pages the list like the Library', async () => {
      const { body } = await as(administrator.token)
        .get('/admin/accounts?pageSize=1&page=2')
        .expect(200);
      expect(body).toMatchObject({
        page: 2,
        pageSize: 1,
        accounts: [expect.any(Object)],
      });
    });
  });

  describe('Suspension', () => {
    it('ends every Sign-in at once, and refuses every way back in', async () => {
      const email = uniqueEmail('ana');
      const laptop = await invitedAccount(running, administrator.token, email);
      await as(laptop.token)
        .post('/identities/me/password')
        .send({ password: GOOD_PASSWORD });
      const phone = (
        await request(running.httpServer)
          .post('/api/sessions/password')
          .send({ email, password: GOOD_PASSWORD })
          .expect(201)
      ).body.token as string;
      await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${email}`, email) })
        .expect(201);

      await as(administrator.token)
        .post(`/admin/accounts/${laptop.id}/suspension`)
        .expect(204);

      await as(laptop.token).get('/identities/me').expect(401);
      await as(phone).get('/identities/me').expect(401);
      const password = await request(running.httpServer)
        .post('/api/sessions/password')
        .send({ email, password: GOOD_PASSWORD })
        .expect(403);
      expect(password.body.reason).toBe('account-suspended');
      const google = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: googleIdToken(`g-${email}`, email) })
        .expect(403);
      expect(google.body.reason).toBe('account-suspended');
      const reset = await request(running.httpServer)
        .post('/api/password-resets')
        .send({ email })
        .expect(403);
      expect(reset.body.reason).toBe('account-suspended');
      expect(await row(email)).toMatchObject({
        suspension: {
          at: '2026-01-01T00:00:00.000Z',
          by: { id: administrator.id },
        },
      });
    });

    it('leaves everything untouched, given back when it is lifted', async () => {
      const email = uniqueEmail('ana');
      const ana = await invitedAccount(running, administrator.token, email);
      await importHands(ana.token);
      await as(ana.token)
        .post('/lab/ranges')
        .send({ name: 'OR BTN', combos: { AsKs: 100 } })
        .expect(201);
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      await as(administrator.token)
        .delete(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      const back = await request(running.httpServer)
        .post('/api/sessions/password')
        .send({ email, password: GOOD_PASSWORD })
        .expect(201);
      const { body: library } = await as(back.body.token)
        .get('/library/hands')
        .expect(200);
      expect(library.total).toBe(4);
      const { body: ranges } = await as(back.body.token)
        .get('/lab/ranges')
        .expect(200);
      expect(ranges).toHaveLength(1);
      expect((await row(email)).suspension).toBeNull();
    });

    it('takes a suspended Master out of the Room as a Kick does, and the role passes on', async () => {
      const anaEmail = uniqueEmail('ana');
      const ana = await invitedAccount(running, administrator.token, anaEmail);
      const bea = await newAccount(running.httpServer);
      const code = await createRoom(ana.token, 'Ana');
      const anaIn = await joined(ana.token, code, 'Ana');
      const beaIn = await joined(bea.token, code, 'Bea');
      await anaIn.socket.next('room.participantJoined');

      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      expect(await beaIn.socket.next('room.participantKicked')).toEqual({
        identityId: ana.id,
      });
      expect(await anaIn.socket.next('room.participantKicked')).toEqual({
        identityId: ana.id,
      });
      await running.clock.advance(MASTER_GRACE_MS);
      expect(await beaIn.socket.next('room.masterChanged')).toEqual({
        masterId: bea.id,
        reason: 'failover',
      });
      // Lifted, the Room stays shut to them, as for anyone Kicked.
      await as(administrator.token)
        .delete(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);
      const back = await request(running.httpServer)
        .post('/api/sessions/password')
        .send({ email: anaEmail, password: GOOD_PASSWORD })
        .expect(201);
      const refused = await RoomClient.connect(running.wsUrl, back.body.token);
      refused.send('room.join', { code, displayName: 'Ana' });
      expect((await refused.next('rejected')).reason).toBe('kicked-from-room');
      await refused.close();
      await anaIn.socket.close();
      await beaIn.socket.close();
    });

    it('cannot suspend an Administrator, oneself included', async () => {
      const res = await as(administrator.token)
        .post(`/admin/accounts/${administrator.id}/suspension`)
        .expect(403);
      expect(res.body.reason).toBe('cannot-suspend-administrator');
    });

    it('offers lifting it when inviting a suspended Account’s email', async () => {
      const email = uniqueEmail('ana');
      const ana = await invitedAccount(running, administrator.token, email);
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      const res = await as(administrator.token)
        .post('/admin/invitations')
        .send({ email })
        .expect(409);

      expect(res.body).toEqual({
        reason: 'account-exists',
        accountId: ana.id,
        suspended: true,
      });
    });
  });

  describe('totals', () => {
    let database: { url: string; drop(): Promise<void> };

    beforeEach(async () => {
      await running.close();
      database = await freshDatabase();
      running = await startApp({
        administratorEmails: [ADMINISTRATOR_EMAIL],
        databaseUrl: database.url,
      });
      administrator = await signInAdministrator(running);
    });

    afterEach(async () => {
      await running.close();
      await database.drop();
      // The outer afterEach closes it again: harmless once closed.
      running = { ...running, close: () => Promise.resolve() };
    });

    it('totals Runout at a glance', async () => {
      const ana = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('ana'),
      );
      const bea = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('bea'),
      );
      await importHands(ana.token);
      await as(bea.token).get('/identities/me').expect(200);
      await as(administrator.token)
        .post(`/admin/accounts/${bea.id}/suspension`)
        .expect(204);
      // Bea was last seen 10 days ago; Ana and the Administrator are here now.
      await running.clock.advance(10 * DAY);
      await invite(running, administrator.token, uniqueEmail('carla'));
      await as(ana.token)
        .post('/lab/ranges')
        .send({ name: 'OR BTN', combos: { AsKs: 100 } })
        .expect(201);
      await createRoom(ana.token, 'Ana');
      const closing = await createRoom(ana.token, 'Ana');
      await as(administrator.token)
        .post(`/admin/rooms/${closing}/close`)
        .expect(204);

      expect(
        (await as(administrator.token).get('/admin/totals').expect(200)).body,
      ).toEqual({
        accounts: 3,
        activeLast7Days: 2,
        activeLast30Days: 3,
        suspended: 1,
        pendingInvitations: 1,
        hands: 4,
        ranges: 1,
        openRooms: 1,
        closedRooms: 1,
      });
    });
  });
});
