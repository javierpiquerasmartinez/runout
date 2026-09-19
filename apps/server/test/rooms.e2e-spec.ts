import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';

const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

describe('Rooms over HTTP (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  async function issueToken(): Promise<string> {
    const res = await request(running.httpServer).post('/api/identities');
    return res.body.token as string;
  }

  function createRoom(token: string | undefined, body: object) {
    const req = request(running.httpServer).post('/api/rooms').send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  it('creates a Room with an 8-character code free of look-alikes', async () => {
    const token = await issueToken();

    const res = await createRoom(token, {
      name: 'Martes NL50 · Sesión 14',
      displayName: 'Javier',
    }).expect(201);

    expect(res.body).toEqual({
      code: expect.stringMatching(ROOM_CODE),
      name: 'Martes NL50 · Sesión 14',
    });
  });

  it('gives every Room its own code', async () => {
    const token = await issueToken();
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await createRoom(token, { name: 'NL50', displayName: 'J' });
      codes.add(res.body.code);
    }
    expect(codes.size).toBe(20);
  });

  it('remembers the Display Name the creator used', async () => {
    const token = await issueToken();
    await createRoom(token, { name: 'NL50', displayName: '  Javier ' });

    const me = await request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`);

    expect(me.body.displayName).toBe('Javier');
  });

  it('accepts a name of up to 60 characters and rejects a longer or blank one', async () => {
    const token = await issueToken();

    await createRoom(token, { name: 'x'.repeat(60), displayName: 'J' }).expect(
      201,
    );
    const tooLong = await createRoom(token, {
      name: 'x'.repeat(61),
      displayName: 'J',
    }).expect(400);
    const blank = await createRoom(token, {
      name: '   ',
      displayName: 'J',
    }).expect(400);

    expect(tooLong.body).toEqual({ reason: 'invalid-room-name' });
    expect(blank.body).toEqual({ reason: 'invalid-room-name' });
  });

  it('rejects a blank Display Name', async () => {
    const token = await issueToken();

    const res = await createRoom(token, { name: 'NL50', displayName: ' ' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ reason: 'invalid-display-name' });
  });

  it('rejects creating a Room without an identity', async () => {
    const res = await createRoom(undefined, {
      name: 'NL50',
      displayName: 'J',
    }).expect(401);

    expect(res.body).toEqual({ reason: 'unauthenticated' });
  });

  it('finds an open Room by code, with or without the dash and in any case', async () => {
    const token = await issueToken();
    const { body: room } = await createRoom(token, {
      name: 'NL50',
      displayName: 'J',
    });
    const typed =
      `${room.code.slice(0, 4)}-${room.code.slice(4)}`.toLowerCase();

    for (const code of [room.code, typed, ` ${typed} `]) {
      const res = await request(running.httpServer)
        .get(`/api/rooms/${encodeURIComponent(code)}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ code: room.code, name: 'NL50' });
    }
  });

  it('answers an unknown code with a typed reason', async () => {
    const token = await issueToken();

    const res = await request(running.httpServer)
      .get('/api/rooms/ZZZZ-ZZZZ')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body).toEqual({ reason: 'room-not-found' });
  });
});
