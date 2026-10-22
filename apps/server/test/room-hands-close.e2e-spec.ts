import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

/** This long with nobody connected and a Room closes on its own. */
const ABANDONED_MS = 30 * 60_000;

describe('Room Hands are discarded on close (e2e)', () => {
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
      .send({ name: 'Martes NL10', displayName: 'Javier' })
      .expect(201);
    return res.body.code as string;
  }

  async function join(
    token: string,
    code: string,
    displayName: string,
  ): Promise<RoomClient> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    await socket.next('room.snapshot');
    return socket;
  }

  /** A Room with Javier as its Master and Marta as a Guest, both Accounts, both in. */
  async function roomOfTwo() {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const code = await createRoom(javier.token);
    const javierSocket = await join(javier.token, code, 'Javier');
    const martaSocket = await join(marta.token, code, 'Marta');
    await javierSocket.next('room.participantJoined');
    return { javier, marta, code, javierSocket, martaSocket };
  }

  /** Imports `file` straight into the Room's Queue; the new Hands' ids. */
  function importIntoRoom(
    code: string,
    token: string,
    file: string,
    sockets: RoomClient[],
  ): Promise<string[]> {
    return importTextIntoRoom(code, token, freshHandHistory(file), sockets);
  }

  async function importTextIntoRoom(
    code: string,
    token: string,
    text: string,
    sockets: RoomClient[],
  ): Promise<string[]> {
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text })
      .expect(201);
    let handIds: string[] = [];
    for (const socket of sockets) {
      const { entries } = await socket.next<{ entries: { handId: string }[] }>(
        'queue.entriesAdded',
      );
      handIds = entries.map((entry) => entry.handId);
    }
    return handIds;
  }

  /** Imports `file` into `token`'s Library; its Hands' ids, newest first. */
  function importIntoLibrary(token: string, file: string): Promise<string[]> {
    return importTextIntoLibrary(token, freshHandHistory(file));
  }

  async function importTextIntoLibrary(
    token: string,
    text: string,
  ): Promise<string[]> {
    const preview = await request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${token}`)
      .send({ text })
      .expect(201);
    await request(running.httpServer)
      .post('/api/library/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ previews: [preview.body.id as string] })
      .expect(201);
    const page = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (page.body.hands as { id: string }[]).map((hand) => hand.id);
  }

  function roomHands(token: string, code: string) {
    return request(running.httpServer)
      .get(`/api/rooms/${code}/room-hands`)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('the warning before closing', () => {
    it('counts the Hands in the Queue that are in nobody’s Library', async () => {
      const { javier, marta, code, javierSocket, martaSocket } =
        await roomOfTwo();
      await importIntoRoom(code, javier.token, 'pokerstars-session.txt', [
        javierSocket,
        martaSocket,
      ]);
      const [fromLibrary] = await importIntoLibrary(
        marta.token,
        'pokerstars-showdown.txt',
      );
      await request(running.httpServer)
        .post(`/api/rooms/${code}/library-hands`)
        .set('Authorization', `Bearer ${marta.token}`)
        .send({ handIds: [fromLibrary] })
        .expect(201);

      await roomHands(javier.token, code).expect(200, { count: 4 });
    });

    it('is the Master’s alone to ask', async () => {
      const { marta, code } = await roomOfTwo();

      await roomHands(marta.token, code).expect(403, { reason: 'not-master' });
    });
  });

  describe('closing', () => {
    it('discards the Room Hands with their Notes and Marks', async () => {
      const { javier, code, javierSocket, martaSocket } = await roomOfTwo();
      const [handId] = await importIntoRoom(
        code,
        javier.token,
        'pokerstars-showdown.txt',
        [javierSocket, martaSocket],
      );
      javierSocket.send('notes.write', { handId, body: 'Overbet the river' });
      await martaSocket.next('notes.written');
      martaSocket.send('hand.setMark', { handId, marked: true });
      await martaSocket.next('hand.markChanged');
      javierSocket.send('playback.load', { handId });
      await martaSocket.next('playback.changed');

      javierSocket.send('room.close');
      await martaSocket.next('room.closed');

      expect(await stored(handId)).toEqual({
        hand: 0,
        notes: 0,
        marks: 0,
        queueEntries: 0,
        playbacks: 0,
      });
    });

    it('keeps a Hand someone imported into their Library before, with its Notes', async () => {
      const { javier, marta, code, javierSocket, martaSocket } =
        await roomOfTwo();
      const text = freshHandHistory('pokerstars-showdown.txt');
      const [handId] = await importTextIntoRoom(code, javier.token, text, [
        javierSocket,
        martaSocket,
      ]);
      javierSocket.send('notes.write', { handId, body: 'Overbet the river' });
      await martaSocket.next('notes.written');
      await importTextIntoLibrary(marta.token, text);
      await roomHands(javier.token, code).expect(200, { count: 0 });

      javierSocket.send('room.close');
      await martaSocket.next('room.closed');

      const res = await request(running.httpServer)
        .get(`/api/hands/${handId}/notes`)
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(200);
      expect(
        (res.body.notes as { body: string }[]).map((note) => note.body),
      ).toEqual(['Overbet the river']);
    });

    it('keeps a Hand also queued in another open Room', async () => {
      const first = await roomOfTwo();
      const second = await roomOfTwo();
      const text = freshHandHistory('pokerstars-showdown.txt');
      const [handId] = await importTextIntoRoom(
        first.code,
        first.javier.token,
        text,
        [first.javierSocket, first.martaSocket],
      );
      await importTextIntoRoom(second.code, second.javier.token, text, [
        second.javierSocket,
        second.martaSocket,
      ]);

      first.javierSocket.send('room.close');
      await first.martaSocket.next('room.closed');

      expect(await stored(handId)).toEqual(
        expect.objectContaining({ hand: 1, queueEntries: 2 }),
      );
      await request(running.httpServer)
        .get(`/api/hands/${handId}`)
        .set('Authorization', `Bearer ${second.marta.token}`)
        .expect(200);
    });

    it('discards them the same way when the Room closes abandoned', async () => {
      const { javier, code, javierSocket, martaSocket } = await roomOfTwo();
      const [handId] = await importIntoRoom(
        code,
        javier.token,
        'pokerstars-showdown.txt',
        [javierSocket, martaSocket],
      );
      javierSocket.send('notes.write', { handId, body: 'Overbet the river' });
      await martaSocket.next('notes.written');

      await Promise.all([javierSocket.close(), martaSocket.close()]);
      await untilEmpty(javier.token, code);
      await running.clock.advance(ABANDONED_MS);
      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${javier.token}`)
        .expect(404, { reason: 'room-not-found' });

      expect(await stored(handId)).toEqual({
        hand: 0,
        notes: 0,
        marks: 0,
        queueEntries: 0,
        playbacks: 0,
      });
    });
  });

  /** Waits for the server to have seen every connection of a Room go. */
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

  /** What is still stored about a Hand, read straight from the database. */
  async function stored(handId: string) {
    const client = new pg.Client(inject('databaseUrl'));
    await client.connect();
    try {
      const count = async (table: string, column: string) => {
        const { rows } = await client.query<{ n: string }>(
          `select count(*) as n from ${table} where ${column} = $1`,
          [handId],
        );
        return Number(rows[0].n);
      };
      return {
        hand: await count('hands', 'id'),
        notes: await count('notes', 'hand_id'),
        marks: await count('marks', 'hand_id'),
        queueEntries: await count('queue_entries', 'hand_id'),
        playbacks: await count('playbacks', 'hand_id'),
      };
    } finally {
      await client.end();
    }
  }
});
