import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface ListedRoom {
  code: string;
  name: string;
  state: 'free-review' | 'live';
  role: 'master' | 'guest';
  hands: number;
  connected: number;
  participants: number;
  lastActivityAt: string;
  master: string;
}

describe('An Account’s Rooms (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  async function createRoom(token: string, name: string): Promise<string> {
    const res = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, displayName: 'Javier' })
      .expect(201);
    return res.body.code as string;
  }

  async function join(token: string, code: string, displayName: string) {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    await socket.next('room.snapshot');
    return socket;
  }

  async function mine(token: string): Promise<ListedRoom[]> {
    const res = await request(running.httpServer)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as ListedRoom[];
  }

  describe('the list', () => {
    it('says, for each open Room, its state, their role, its Hands, who is in it and who leads it', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      const javierSocket = await join(javier.token, code, 'Javier');
      const martaSocket = await join(marta.token, code, 'Marta');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${javier.token}`)
        .send({ text: freshHandHistory('pokerstars-showdown.txt') })
        .expect(201);
      await martaSocket.next('queue.entriesAdded');
      await martaSocket.close();
      await javierSocket.next('room.participantLeft');

      expect(await mine(marta.token)).toEqual([
        {
          code,
          name: 'Martes NL50',
          state: 'free-review',
          role: 'guest',
          hands: 1,
          connected: 1,
          participants: 2,
          lastActivityAt: expect.any(String),
          master: 'Javier',
          joinedAt: expect.any(String),
        },
      ]);
      expect((await mine(javier.token))[0]).toMatchObject({
        code,
        role: 'master',
      });
    });

    it('puts Live Rooms first, then the rest by most recent activity', async () => {
      const javier = await newAccount(running.httpServer);
      const quiet = await createRoom(javier.token, 'Quiet');
      await running.clock.advance(60_000);
      const busy = await createRoom(javier.token, 'Busy');
      await running.clock.advance(60_000);
      const live = await createRoom(javier.token, 'Live');
      await running.clock.advance(60_000);
      await join(javier.token, busy, 'Javier');
      const liveSocket = await join(javier.token, live, 'Javier');
      liveSocket.send('live.start', {});
      await liveSocket.next('live.started');
      await running.clock.advance(60_000);
      await join(javier.token, quiet, 'Javier');
      // Quiet was entered last, so it comes before Busy; Live comes first anyway.

      expect((await mine(javier.token)).map((room) => room.name)).toEqual([
        'Live',
        'Quiet',
        'Busy',
      ]);
    });

    it('moves a Room between their roles when the Master role changes hands', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      const javierSocket = await join(javier.token, code, 'Javier');
      const martaSocket = await join(marta.token, code, 'Marta');

      javierSocket.send('room.handOver', { identityId: marta.id });
      await martaSocket.next('room.masterChanged');

      expect((await mine(marta.token))[0].role).toBe('master');
      expect((await mine(javier.token))[0].role).toBe('guest');
    });
  });

  describe('renaming', () => {
    it('lets the Master rename the Room, for the list and everyone in it', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      const martaSocket = await join(marta.token, code, 'Marta');

      await request(running.httpServer)
        .patch(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${javier.token}`)
        .send({ name: 'Jueves NL100' })
        .expect(200, { code, name: 'Jueves NL100' });

      expect(await martaSocket.next('room.renamed')).toEqual({
        name: 'Jueves NL100',
      });
      expect((await mine(marta.token))[0].name).toBe('Jueves NL100');
    });

    it('refuses a Guest, and a name that is blank or too long', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      await join(marta.token, code, 'Marta');

      await request(running.httpServer)
        .patch(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${marta.token}`)
        .send({ name: 'Mine now' })
        .expect(403, { reason: 'not-master' });
      for (const name of ['   ', 'x'.repeat(61)]) {
        await request(running.httpServer)
          .patch(`/api/rooms/${code}`)
          .set('Authorization', `Bearer ${javier.token}`)
          .send({ name })
          .expect(400, { reason: 'invalid-room-name' });
      }
    });
  });

  describe('closing', () => {
    it('lets the Master close the Room from the list, for everyone in it', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      const martaSocket = await join(marta.token, code, 'Marta');

      await request(running.httpServer)
        .post(`/api/rooms/${code}/close`)
        .set('Authorization', `Bearer ${javier.token}`)
        .expect(204);

      await martaSocket.next('room.closed');
      expect(await mine(javier.token)).toEqual([]);
      expect(await mine(marta.token)).toEqual([]);
    });

    it('refuses a Guest', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      await join(marta.token, code, 'Marta');

      await request(running.httpServer)
        .post(`/api/rooms/${code}/close`)
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(403, { reason: 'not-master' });
      expect(await mine(marta.token)).toHaveLength(1);
    });
  });

  describe('leaving', () => {
    it('takes the Room off a Guest’s list and out of their open tab, leaving their Notes behind', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      const javierSocket = await join(javier.token, code, 'Javier');
      const martaSocket = await join(marta.token, code, 'Marta');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${javier.token}`)
        .send({ text: freshHandHistory('pokerstars-showdown.txt') })
        .expect(201);
      const { entries } = await martaSocket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');
      martaSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'Fold the river.',
      });
      await javierSocket.next('notes.written');

      await request(running.httpServer)
        .delete(`/api/rooms/${code}/membership`)
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(204);

      expect(await mine(marta.token)).toEqual([]);
      await martaSocket.next('room.left');
      expect(await javierSocket.next('room.participantLeft')).toEqual({
        identityId: marta.id,
      });
      const snapshot = await (async () => {
        const socket = await RoomClient.connect(running.wsUrl, javier.token);
        clients.push(socket);
        socket.send('room.join', { code, displayName: 'Javier' });
        return socket.next<{ notes: { body: string }[] }>('room.snapshot');
      })();
      expect(snapshot.notes.map((note) => note.body)).toEqual([
        'Fold the river.',
      ]);
    });

    it('lets them join again with the link, as a new Participant', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');
      await join(marta.token, code, 'Marta');
      await request(running.httpServer)
        .delete(`/api/rooms/${code}/membership`)
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(204);

      await join(marta.token, code, 'Marta');

      expect((await mine(marta.token)).map((room) => room.code)).toEqual([
        code,
      ]);
    });

    it('refuses the Master, who closes the Room or hands the role over instead', async () => {
      const javier = await newAccount(running.httpServer);
      const code = await createRoom(javier.token, 'Martes NL50');

      await request(running.httpServer)
        .delete(`/api/rooms/${code}/membership`)
        .set('Authorization', `Bearer ${javier.token}`)
        .expect(409, { reason: 'master-must-choose' });
      expect(await mine(javier.token)).toHaveLength(1);
    });
  });
});
