import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { googleIdToken, newAccount } from './support/google.js';

interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
}

interface Snapshot {
  you: string;
  participants: Participant[];
  queue: { id: string; handId: string }[];
}

interface Note {
  id: string;
  writer: { identityId: string; displayName: string };
}

/** This long with nobody connected and a Room closes on its own. */
const ABANDONED_MS = 30 * 60_000;
/** This long without its Master and a Room passes the role on. */
const GRACE_MS = 120_000;

describe('Anonymous identities last one Room (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  async function createRoom(token: string): Promise<string> {
    const res = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Martes NL50', displayName: 'Javier' })
      .expect(201);
    return res.body.code as string;
  }

  function joinAnonymously(code: string, displayName: string) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/guests`)
      .send({ displayName });
  }

  async function enter(
    token: string,
    code: string,
    displayName: string,
  ): Promise<{ socket: RoomClient; snapshot: Snapshot }> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    return { socket, snapshot: await socket.next<Snapshot>('room.snapshot') };
  }

  /** A Room with its Master (an Account) and an anonymous Guest, both in it. */
  async function roomWithAnonymousGuest() {
    const master = await newAccount(running.httpServer);
    const code = await createRoom(master.token);
    const masterRoom = await enter(master.token, code, 'Javier');
    const issued = await joinAnonymously(code, 'Marta').expect(201);
    const anonymous = {
      token: issued.body.token as string,
      id: issued.body.identity.id as string,
    };
    const guestRoom = await enter(anonymous.token, code, 'Marta');
    await masterRoom.socket.next('room.participantJoined');
    return {
      code,
      master,
      anonymous,
      masterSocket: masterRoom.socket,
      guestSocket: guestRoom.socket,
    };
  }

  function me(token: string) {
    return request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`);
  }

  /**
   * Waits until the server has seen everyone go; the disconnect of a socket
   * reaches the server a moment after the client sees it close.
   */
  async function untilEmpty(token: string, code: string): Promise<void> {
    await expect
      .poll(async () => {
        const res = await request(running.httpServer)
          .get('/api/rooms')
          .set('Authorization', `Bearer ${token}`);
        return (res.body as { code: string; live: boolean }[]).find(
          (open) => open.code === code,
        )?.live;
      })
      .toBe(false);
  }

  /** What is still stored for an identity, read straight from the database. */
  async function storedFor(identityId: string) {
    const client = new pg.Client(inject('databaseUrl'));
    await client.connect();
    try {
      const count = async (table: string) => {
        const { rows } = await client.query<{ n: string }>(
          `select count(*) as n from ${table} where identity_id = $1`,
          [identityId],
        );
        return Number(rows[0].n);
      };
      const { rows } = await client.query<{ display_name: string | null }>(
        'select display_name from identities where id = $1',
        [identityId],
      );
      return {
        identity: rows[0] ?? null,
        screenNames: await count('screen_names'),
        preferences: await count('preferences'),
        marks: await count('marks'),
      };
    } finally {
      await client.end();
    }
  }

  describe('issuing', () => {
    it('no longer issues an identity just for opening Runout', async () => {
      await request(running.httpServer).post('/api/identities').expect(404);
    });

    it('lets someone without a token look a Room up before joining it', async () => {
      const master = await newAccount(running.httpServer);
      const code = await createRoom(master.token);

      const res = await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .expect(200);

      expect(res.body).toEqual({ code, name: 'Martes NL50' });
    });

    it('issues an identity for that Room when someone without an Account joins it, under the Display Name they chose', async () => {
      const master = await newAccount(running.httpServer);
      const code = await createRoom(master.token);

      const res = await joinAnonymously(code, '  Marta ').expect(201);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.identity).toEqual({
        id: expect.any(String),
        displayName: 'Marta',
        screenNames: [],
        preferences: expect.any(Object),
        account: null,
        room: { code },
      });
      const { snapshot } = await enter(res.body.token, code, 'Marta');
      expect(snapshot.participants).toContainEqual(
        expect.objectContaining({
          identityId: res.body.identity.id,
          displayName: 'Marta',
          role: 'guest',
        }),
      );
    });

    it('refuses to issue one for a Room that is not open, or without a Display Name', async () => {
      const master = await newAccount(running.httpServer);
      const code = await createRoom(master.token);

      const unknown = await joinAnonymously('ZZZZZZZZ', 'Marta').expect(404);
      expect(unknown.body).toEqual({ reason: 'room-not-found' });
      const unnamed = await joinAnonymously(code, '   ').expect(400);
      expect(unnamed.body).toEqual({ reason: 'invalid-display-name' });
    });

    it('gives a second Room joined anonymously a different identity', async () => {
      const master = await newAccount(running.httpServer);
      const first = await createRoom(master.token);
      const second = await createRoom(master.token);

      const inFirst = await joinAnonymously(first, 'Marta').expect(201);
      const inSecond = await joinAnonymously(second, 'Marta').expect(201);

      expect(inSecond.body.identity.id).not.toBe(inFirst.body.identity.id);
    });

    it('keeps an anonymous identity out of every Room but its own', async () => {
      const master = await newAccount(running.httpServer);
      const first = await createRoom(master.token);
      const second = await createRoom(master.token);
      const issued = await joinAnonymously(first, 'Marta').expect(201);

      const socket = await RoomClient.connect(running.wsUrl, issued.body.token);
      clients.push(socket);
      socket.send('room.join', { code: second, displayName: 'Marta' });

      expect(await socket.next('rejected')).toEqual({
        command: 'room.join',
        reason: 'identity-of-another-room',
      });
    });

    it('lists open Rooms on the welcome screen for Accounts only', async () => {
      const { anonymous } = await roomWithAnonymousGuest();

      const res = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${anonymous.token}`)
        .expect(403);

      expect(res.body).toEqual({ reason: 'account-required' });
    });
  });

  describe('when the Room closes', () => {
    it('ends its anonymous identities when the Master closes it, with their Screen Names, Preferences and Marks', async () => {
      const room = await roomWithAnonymousGuest();
      await request(running.httpServer)
        .put('/api/identities/me/screen-names')
        .set('Authorization', `Bearer ${room.anonymous.token}`)
        .send({ screenNames: ['marta88'] })
        .expect(200);
      await request(running.httpServer)
        .patch('/api/identities/me/preferences')
        .set('Authorization', `Bearer ${room.anonymous.token}`)
        .send({ theme: 'light' })
        .expect(200);
      await request(running.httpServer)
        .post(`/api/rooms/${room.code}/hands`)
        .set('Authorization', `Bearer ${room.master.token}`)
        .send({ text: freshHandHistory('pokerstars-session.txt') })
        .expect(201);
      const { entries } = await room.guestSocket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');
      room.guestSocket.send('hand.setMark', {
        handId: entries[0].handId,
        marked: true,
      });
      await room.guestSocket.next('hand.markChanged');
      expect(await storedFor(room.anonymous.id)).toMatchObject({
        screenNames: 1,
        preferences: 1,
        marks: 1,
      });

      room.masterSocket.send('room.close');
      await room.guestSocket.next('room.closed');

      const after = await me(room.anonymous.token).expect(401);
      expect(after.body).toEqual({ reason: 'unauthenticated' });
      expect(await storedFor(room.anonymous.id)).toEqual({
        // Kept, so the Notes they wrote keep their name.
        identity: { display_name: 'Marta' },
        screenNames: 0,
        preferences: 0,
        marks: 0,
      });
      // The Master's Account goes on.
      await me(room.master.token).expect(200);
    });

    it('ends them too when the Room closes after being abandoned', async () => {
      const room = await roomWithAnonymousGuest();
      await room.guestSocket.close();
      await room.masterSocket.close();
      await untilEmpty(room.master.token, room.code);

      await running.clock.advance(ABANDONED_MS);

      await expect
        .poll(async () => (await me(room.anonymous.token)).status)
        .toBe(401);
      await me(room.master.token).expect(200);
    });

    it('keeps the Display Name of an anonymous writer on the Notes they wrote', async () => {
      const room = await roomWithAnonymousGuest();
      const text = freshHandHistory('pokerstars-session.txt');
      await request(running.httpServer)
        .post(`/api/rooms/${room.code}/hands`)
        .set('Authorization', `Bearer ${room.master.token}`)
        .send({ text })
        .expect(201);
      const { entries } = await room.guestSocket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');
      room.guestSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'Fold al river.',
      });
      await room.masterSocket.next('notes.written');
      room.masterSocket.send('room.close');
      await room.masterSocket.next('room.closed');

      // The same Hand, brought into a new Room, arrives with its Notes.
      const next = await createRoom(room.master.token);
      const { socket } = await enter(room.master.token, next, 'Javier');
      await request(running.httpServer)
        .post(`/api/rooms/${next}/hands`)
        .set('Authorization', `Bearer ${room.master.token}`)
        .send({ text })
        .expect(201);

      const added = await socket.next<{ notes: Note[] }>('queue.entriesAdded');
      expect(added.notes.map((note) => note.writer)).toEqual([
        { identityId: room.anonymous.id, displayName: 'Marta' },
      ]);
    });
  });

  describe('becoming Master', () => {
    it('lets an anonymous Participant take the role by hand-over', async () => {
      const room = await roomWithAnonymousGuest();

      room.masterSocket.send('room.handOver', {
        identityId: room.anonymous.id,
      });

      expect(await room.guestSocket.next('room.masterChanged')).toEqual({
        masterId: room.anonymous.id,
        reason: 'handover',
      });
    });

    it('passes the role to an anonymous Participant when the Master drops', async () => {
      const room = await roomWithAnonymousGuest();
      await room.masterSocket.close();
      await room.guestSocket.next('room.participantLeft');

      await running.clock.advance(GRACE_MS);

      expect(await room.guestSocket.next('room.masterChanged')).toEqual({
        masterId: room.anonymous.id,
        reason: 'failover',
      });
    });
  });

  describe('signing in from inside a Room', () => {
    function signInFrom(anonymousToken: string, subject = 'marta-subject') {
      return request(running.httpServer)
        .post('/api/sessions/google')
        .set('Authorization', `Bearer ${anonymousToken}`)
        .send({ idToken: googleIdToken(subject) });
    }

    it('puts the Account in the anonymous identity’s place, which ends there', async () => {
      const room = await roomWithAnonymousGuest();
      const { body: anonymousRooms } = await request(running.httpServer)
        .get(`/api/rooms/${room.code}`)
        .set('Authorization', `Bearer ${room.anonymous.token}`)
        .expect(200);
      expect(anonymousRooms).toEqual({ code: room.code, name: 'Martes NL50' });

      const signedIn = await signInFrom(room.anonymous.token).expect(201);

      const account = signedIn.body.identity as { id: string };
      expect(signedIn.body.identity).toMatchObject({
        // A first-time Account goes on under the name it had in the Room.
        displayName: 'Marta',
        account: { email: 'marta-subject@example.com' },
        room: null,
      });
      await me(room.anonymous.token).expect(401);
      expect(await room.masterSocket.next('room.participantLeft')).toEqual({
        identityId: room.anonymous.id,
      });
      const listed = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${signedIn.body.token}`)
        .expect(200);
      expect(listed.body).toEqual([
        expect.objectContaining({ code: room.code }),
      ]);
      const { snapshot } = await enter(signedIn.body.token, room.code, 'Marta');
      expect(snapshot.participants.map((p) => p.identityId)).toEqual([
        expect.any(String),
        account.id,
      ]);
    });

    it('carries the Master role over to the Account', async () => {
      const room = await roomWithAnonymousGuest();
      room.masterSocket.send('room.handOver', {
        identityId: room.anonymous.id,
      });
      await room.masterSocket.next('room.masterChanged');

      const signedIn = await signInFrom(room.anonymous.token).expect(201);

      expect(await room.masterSocket.next('room.masterChanged')).toEqual({
        masterId: signedIn.body.identity.id,
        reason: 'sign-in',
      });
      const { snapshot } = await enter(signedIn.body.token, room.code, 'Marta');
      expect(snapshot.participants).toContainEqual(
        expect.objectContaining({
          identityId: signedIn.body.identity.id,
          role: 'master',
        }),
      );
    });

    it('takes nothing over for an Account the Master kicked from the Room', async () => {
      const marta = await newAccount(running.httpServer, 'marta-subject');
      const room = await roomWithAnonymousGuest();
      await enter(marta.token, room.code, 'Marta G.');
      await room.masterSocket.next('room.participantJoined');
      room.masterSocket.send('room.kick', { identityId: marta.id });
      await room.masterSocket.next('room.participantKicked');
      room.masterSocket.send('room.handOver', {
        identityId: room.anonymous.id,
      });
      await room.masterSocket.next('room.masterChanged');

      await signInFrom(room.anonymous.token).expect(201);

      await me(room.anonymous.token).expect(401);
      const socket = await RoomClient.connect(running.wsUrl, marta.token);
      clients.push(socket);
      socket.send('room.join', { code: room.code, displayName: 'Marta G.' });
      expect(await socket.next('rejected')).toEqual({
        command: 'room.join',
        reason: 'kicked-from-room',
      });
      expect(room.masterSocket.all('room.masterChanged')).toEqual([]);
    });

    it('keeps the Display Name an Account already had', async () => {
      const marta = await newAccount(running.httpServer, 'marta-subject');
      await request(running.httpServer)
        .put('/api/identities/me/display-name')
        .set('Authorization', `Bearer ${marta.token}`)
        .send({ displayName: 'Marta G.' })
        .expect(200);
      const room = await roomWithAnonymousGuest();

      const signedIn = await signInFrom(room.anonymous.token).expect(201);

      expect(signedIn.body.identity).toMatchObject({
        id: marta.id,
        displayName: 'Marta G.',
      });
    });
  });
});
