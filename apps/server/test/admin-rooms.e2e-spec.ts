import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { newAccount } from './support/google.js';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';

const MINUTE = 60_000;

describe('The Rooms tab (e2e)', () => {
  let running: RunningApp;
  let administrator: string;

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = (await signInAdministrator(running)).token;
  });

  afterEach(async () => {
    await running.close();
  });

  const panel = (path: string) =>
    request(running.httpServer)
      .get(`/api/admin${path}`)
      .set('Authorization', `Bearer ${administrator}`);

  async function openRoom(token: string, name = 'Martes NL50') {
    const { body } = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, displayName: 'Ana' })
      .expect(201);
    return body.code as string;
  }

  async function join(token: string, code: string, displayName: string) {
    const socket = await RoomClient.connect(running.wsUrl, token);
    socket.send('room.join', { code, displayName });
    await socket.next('room.snapshot');
    return socket;
  }

  /** The Room as the tab lists it, found by its code. */
  async function listed(code: string) {
    const { body } = await panel(`/rooms?search=${code}`).expect(200);
    expect(body.total).toBe(1);
    return body.rooms[0];
  }

  it('lists a Room with its name, code, Master, status, Participants, Queue and dates', async () => {
    const ana = await newAccount(running.httpServer);
    await request(running.httpServer)
      .put('/api/identities/me/display-name')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ displayName: 'Ana' });
    const code = await openRoom(ana.token);
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    await request(running.httpServer)
      .post(`/api/rooms/${code}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${code}/guests`)
      .send({ displayName: 'Alberto' })
      .expect(201);
    const socket = await join(guest.body.token, code, 'Alberto');
    await socket.close();

    expect(await listed(code)).toEqual({
      code,
      name: 'Martes NL50',
      status: 'open',
      state: 'free-review',
      master: { id: ana.id, displayName: 'Ana', email: expect.any(String) },
      participants: 2,
      queueLength: 4,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      closedAt: null,
    });
  });

  it('moves the last activity with every Revision and every join', async () => {
    const ana = await newAccount(running.httpServer);
    const code = await openRoom(ana.token);
    const socket = await join(ana.token, code, 'Ana');

    await running.clock.advance(10 * MINUTE);
    const bea = await newAccount(running.httpServer);
    const beaSocket = await join(bea.token, code, 'Bea');
    expect((await listed(code)).lastActivityAt).toBe(
      '2026-01-01T00:10:00.000Z',
    );

    await running.clock.advance(5 * MINUTE);
    socket.send('room.handOver', { identityId: bea.id });
    await beaSocket.next('room.masterChanged');
    expect((await listed(code)).lastActivityAt).toBe(
      '2026-01-01T00:15:00.000Z',
    );

    await socket.close();
    await beaSocket.close();
  });

  it('filters to open Rooms, and puts the stalest first', async () => {
    const ana = await newAccount(running.httpServer);
    const name = `Filter ${ana.id}`;
    const stale = await openRoom(ana.token, name);
    await running.clock.advance(10 * MINUTE);
    const fresh = await openRoom(ana.token, name);
    const closed = await openRoom(ana.token, name);
    await request(running.httpServer)
      .post(`/api/admin/rooms/${closed}/close`)
      .set('Authorization', `Bearer ${administrator}`)
      .expect(204);

    const { body } = await panel(
      `/rooms?status=open&search=${encodeURIComponent(name)}`,
    ).expect(200);
    const codes = (body.rooms as { code: string; status: string }[]).map(
      (room) => room.code,
    );
    expect(codes).toEqual([stale, fresh]);
    expect((await listed(closed)).status).toBe('closed');
  });

  it('says whether each Room is in Free Review or Live', async () => {
    const ana = await newAccount(running.httpServer);
    const code = await openRoom(ana.token);
    expect((await listed(code)).state).toBe('free-review');

    const anaSocket = await join(ana.token, code, 'Ana');
    anaSocket.send('live.start', {});
    await anaSocket.next('live.started');
    expect((await listed(code)).state).toBe('live');
    await anaSocket.close();
  });

  it('closes an open Room exactly as its Master would', async () => {
    const ana = await newAccount(running.httpServer);
    const code = await openRoom(ana.token);
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${code}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);
    const anaSocket = await join(ana.token, code, 'Ana');
    const martaSocket = await join(guest.body.token, code, 'Marta');

    await request(running.httpServer)
      .post(`/api/admin/rooms/${code}/close`)
      .set('Authorization', `Bearer ${administrator}`)
      .expect(204);

    await anaSocket.next('room.closed');
    await martaSocket.next('room.closed');
    // The anonymous identity ended with it; the Room Code no longer works.
    await request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${guest.body.token}`)
      .expect(401);
    await request(running.httpServer).get(`/api/rooms/${code}`).expect(404);
    expect(await listed(code)).toMatchObject({
      status: 'closed',
      closedAt: '2026-01-01T00:00:00.000Z',
    });
    const again = await request(running.httpServer)
      .post(`/api/admin/rooms/${code}/close`)
      .set('Authorization', `Bearer ${administrator}`)
      .expect(404);
    expect(again.body.reason).toBe('room-not-found');
    await anaSocket.close();
    await martaSocket.close();
  });

  describe('ending Live', () => {
    const endLive = (code: string, token = administrator) =>
      request(running.httpServer)
        .post(`/api/admin/rooms/${code}/end-live`)
        .set('Authorization', `Bearer ${token}`);

    it('ends Live for everyone, with no Master involved, keeping the Room open', async () => {
      const ana = await newAccount(running.httpServer);
      const code = await openRoom(ana.token);
      const guest = await request(running.httpServer)
        .post(`/api/rooms/${code}/guests`)
        .send({ displayName: 'Marta' })
        .expect(201);
      const anaSocket = await join(ana.token, code, 'Ana');
      const martaSocket = await join(guest.body.token, code, 'Marta');
      anaSocket.send('live.start', {});
      await martaSocket.next('live.started');

      await endLive(code).expect(204);

      await anaSocket.next('live.ended');
      await martaSocket.next('live.ended');
      expect(await listed(code)).toMatchObject({
        status: 'open',
        state: 'free-review',
      });
      // Back in Free Review: the Master can go Live again.
      anaSocket.send('live.start', {});
      await martaSocket.next('live.started');
      await anaSocket.close();
      await martaSocket.close();
    });

    it('refuses anyone but an Administrator, the Room’s Master included', async () => {
      const ana = await newAccount(running.httpServer);
      const code = await openRoom(ana.token);
      const anaSocket = await join(ana.token, code, 'Ana');
      anaSocket.send('live.start', {});
      await anaSocket.next('live.started');

      const res = await endLive(code, ana.token).expect(404);
      expect(res.body).toEqual({ reason: 'not-found' });
      expect((await listed(code)).state).toBe('live');
      await anaSocket.close();
    });

    it('answers not-live for a Room in Free Review, and room-not-found for one closed or unknown', async () => {
      const ana = await newAccount(running.httpServer);
      const code = await openRoom(ana.token);
      expect((await endLive(code).expect(409)).body.reason).toBe('not-live');

      await request(running.httpServer)
        .post(`/api/admin/rooms/${code}/close`)
        .set('Authorization', `Bearer ${administrator}`)
        .expect(204);
      expect((await endLive(code).expect(404)).body.reason).toBe(
        'room-not-found',
      );
      expect((await endLive('ZZZZZZ').expect(404)).body.reason).toBe(
        'room-not-found',
      );
    });
  });
});
