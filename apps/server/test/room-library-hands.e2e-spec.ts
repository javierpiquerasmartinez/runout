import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface QueueEntry {
  id: string;
  handId: string;
  position: number;
  author: { identityId: string; displayName: string };
}

interface Snapshot {
  queue: QueueEntry[];
  inLibrary: string[];
}

interface InLibrary {
  handIds: string[];
  inLibrary: boolean;
}

describe('Library Hands in a Room (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  /** Imports `text` into `token`'s Library and returns its Hands' ids, newest first. */
  async function importIntoLibrary(
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
  ): Promise<{ socket: RoomClient; snapshot: Snapshot }> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    return { socket, snapshot: await socket.next<Snapshot>('room.snapshot') };
  }

  function addFromLibrary(token: string, code: string, handIds: unknown) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/library-hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ handIds });
  }

  /** A Room with Javier as its Master and Marta as a Guest, both Accounts, both in. */
  async function roomOfTwo() {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const code = await createRoom(javier.token);
    const javierRoom = await join(javier.token, code, 'Javier');
    const martaRoom = await join(marta.token, code, 'Marta');
    return {
      javier,
      marta,
      code,
      javierSocket: javierRoom.socket,
      martaSocket: martaRoom.socket,
    };
  }

  it('appends the chosen Hands to the end of the Queue, with the sender as their Author', async () => {
    const { javier, marta, code, javierSocket, martaSocket } =
      await roomOfTwo();
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${javier.token}`)
      .send({ text: freshHandHistory('pokerstars-showdown.txt') })
      .expect(201);
    await javierSocket.next('queue.entriesAdded');
    await martaSocket.next('queue.entriesAdded');
    const [newest, , oldest] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-session.txt'),
    );

    const res = await addFromLibrary(marta.token, code, [oldest, newest]);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ added: 2 });
    for (const socket of [javierSocket, martaSocket]) {
      const { entries } = await socket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      expect(entries).toEqual([
        expect.objectContaining({
          handId: oldest,
          position: 2,
          author: { identityId: marta.id, displayName: 'Marta' },
        }),
        expect.objectContaining({
          handId: newest,
          position: 3,
          author: { identityId: marta.id, displayName: 'Marta' },
        }),
      ]);
    }
  });

  it('makes the sender the Author, even when another Participant’s Screen Names claim the Hero', async () => {
    const { javier, marta, code, martaSocket } = await roomOfTwo();
    await request(running.httpServer)
      .put('/api/identities/me/screen-names')
      .set('Authorization', `Bearer ${javier.token}`)
      .send({ screenNames: ['iMapleAA'] })
      .expect(200);
    const [handId] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    await addFromLibrary(marta.token, code, [handId]).expect(201);

    const { entries } = await martaSocket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );
    expect(entries[0].author.identityId).toBe(marta.id);
  });

  it('leaves out Hands already in the Queue', async () => {
    const { marta, code, martaSocket } = await roomOfTwo();
    const [first, second] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-session.txt'),
    );
    await addFromLibrary(marta.token, code, [first]).expect(201);
    await martaSocket.next('queue.entriesAdded');

    const res = await addFromLibrary(marta.token, code, [first, second]);

    expect(res.body).toEqual({ added: 1 });
    const { entries } = await martaSocket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );
    expect(entries.map((entry) => entry.handId)).toEqual([second]);
  });

  it('refuses, adding nothing, when a Hand is not in the sender’s own Library', async () => {
    const { javier, marta, code, javierSocket } = await roomOfTwo();
    const [own] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    const [javiers] = await importIntoLibrary(
      javier.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    for (const handIds of [
      [own, javiers],
      [own, 'not-a-hand'],
    ]) {
      const res = await addFromLibrary(marta.token, code, handIds).expect(404);
      expect(res.body).toEqual({ reason: 'hand-not-found' });
    }
    const { snapshot } = await join(javier.token, code, 'Javier');
    expect(snapshot.queue).toEqual([]);
    expect(javierSocket.all('queue.entriesAdded')).toEqual([]);
  });

  it('refuses a selection that is not a list of Hand ids', async () => {
    const { marta, code } = await roomOfTwo();

    for (const handIds of [undefined, [], 'abc', [7]]) {
      const res = await addFromLibrary(marta.token, code, handIds).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-hand-selection' });
    }
  });

  it('refuses someone who is not in the Room', async () => {
    const { code } = await roomOfTwo();
    const stranger = await newAccount(running.httpServer);
    const [handId] = await importIntoLibrary(
      stranger.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const res = await addFromLibrary(stranger.token, code, [handId]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ reason: 'not-in-room' });
  });

  it('refuses an anonymous Participant: they have no Library', async () => {
    const javier = await newAccount(running.httpServer);
    const code = await createRoom(javier.token);
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${code}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);

    const res = await addFromLibrary(guest.body.token as string, code, [
      '00000000-0000-4000-8000-000000000000',
    ]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ reason: 'account-required' });
  });

  it('lets the Master reassign the Author in this Room only', async () => {
    const { javier, marta, code, javierSocket } = await roomOfTwo();
    const [handId] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    await addFromLibrary(marta.token, code, [handId]).expect(201);
    await javierSocket.next('queue.entriesAdded');
    const other = await createRoom(javier.token);
    const { socket: otherSocket } = await join(marta.token, other, 'Marta');
    await addFromLibrary(marta.token, other, [handId]).expect(201);
    await otherSocket.next('queue.entriesAdded');

    javierSocket.send('queue.reassignAuthor', { handId, authorId: javier.id });
    await javierSocket.next('queue.authorChanged');

    const { snapshot } = await join(javier.token, code, 'Javier');
    const { snapshot: otherSnapshot } = await join(marta.token, other, 'Marta');
    expect(snapshot.queue[0].author.identityId).toBe(javier.id);
    expect(otherSnapshot.queue[0].author.identityId).toBe(marta.id);
  });

  it('keeps the Notes written in the Room on the Library Hand once the Room closes', async () => {
    const { javier, marta, code, javierSocket } = await roomOfTwo();
    const [handId] = await importIntoLibrary(
      marta.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    await addFromLibrary(marta.token, code, [handId]).expect(201);
    await javierSocket.next('queue.entriesAdded');
    javierSocket.send('notes.write', { handId, body: 'Value bet fino.' });
    await javierSocket.next('notes.written');

    javierSocket.send('room.close');
    await javierSocket.next('room.closed');

    const notes = await request(running.httpServer)
      .get(`/api/hands/${handId}/notes`)
      .set('Authorization', `Bearer ${marta.token}`)
      .expect(200);
    expect(notes.body.notes).toEqual([
      expect.objectContaining({
        body: 'Value bet fino.',
        writer: { identityId: javier.id, displayName: 'Javier' },
      }),
    ]);
  });

  describe('whether a Queue Entry is in the viewer’s Library', () => {
    it('tells only the Participants who have the Hand, as it joins the Queue', async () => {
      const { javier, marta, code, javierSocket, martaSocket } =
        await roomOfTwo();
      const [handId] = await importIntoLibrary(
        marta.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      await addFromLibrary(marta.token, code, [handId]).expect(201);

      await martaSocket.next('queue.entriesAdded');
      expect(await martaSocket.next<InLibrary>('queue.inLibrary')).toEqual({
        handIds: [handId],
        inLibrary: true,
      });
      await javierSocket.next('queue.entriesAdded');
      expect(javierSocket.all('queue.inLibrary')).toEqual([]);
      const { snapshot } = await join(javier.token, code, 'Javier');
      expect(snapshot.inLibrary).toEqual([]);
    });

    it('lists, in the snapshot, the Queue’s Hands that are in the viewer’s Library', async () => {
      const { javier, marta, code, martaSocket } = await roomOfTwo();
      const text = freshHandHistory('pokerstars-session.txt');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${javier.token}`)
        .send({ text })
        .expect(201);
      const { entries } = await martaSocket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      // Marta keeps one of those very Hands in her Library.
      const one = text.split(/\n\s*\n/)[0];
      await importIntoLibrary(marta.token, one);

      const { snapshot } = await join(marta.token, code, 'Marta');

      expect(snapshot.inLibrary).toEqual([entries[0].handId]);
    });

    it('follows the viewer’s Library as they import into it or remove from it', async () => {
      const { javier, marta, code, martaSocket } = await roomOfTwo();
      const text = freshHandHistory('pokerstars-showdown.txt');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${javier.token}`)
        .send({ text })
        .expect(201);
      const { entries } = await martaSocket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      const handId = entries[0].handId;

      await importIntoLibrary(marta.token, text);
      expect(await martaSocket.next<InLibrary>('queue.inLibrary')).toEqual({
        handIds: [handId],
        inLibrary: true,
      });

      await request(running.httpServer)
        .delete('/api/library/hands')
        .set('Authorization', `Bearer ${marta.token}`)
        .send({ handIds: [handId] })
        .expect(200);
      expect(await martaSocket.next<InLibrary>('queue.inLibrary')).toEqual({
        handIds: [handId],
        inLibrary: false,
      });
    });

    it('says nothing of Library Hands that are not in the Queue', async () => {
      const { marta, martaSocket } = await roomOfTwo();

      await importIntoLibrary(
        marta.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      // The snapshot after the import reads what the import sent before it.
      const rejoined = await join(
        marta.token,
        await createRoom(marta.token),
        'Marta',
      );
      expect(rejoined.snapshot.inLibrary).toEqual([]);
      expect(martaSocket.all('queue.inLibrary')).toEqual([]);
    });
  });
});
