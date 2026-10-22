import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface LibraryPage {
  total: number;
  hands: { id: string; tags: { id: string }[] }[];
  counts: { all: number; marked: number };
  options: { tags: { id: string; hands: number }[] };
}

describe('Removing Hands from the Library (e2e)', () => {
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
  async function importText(token: string, text: string): Promise<string[]> {
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
    return (await list(token)).hands.map((hand) => hand.id);
  }

  async function list(token: string, query: string = ''): Promise<LibraryPage> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LibraryPage;
  }

  function remove(token: string, handIds: unknown) {
    return request(running.httpServer)
      .delete('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .send({ handIds });
  }

  it('takes the Hands out of the list and the Results', async () => {
    const account = await newAccount(running.httpServer);
    const ids = await importText(
      account.token,
      freshHandHistory('pokerstars-session.txt'),
    );
    const [gone, alsoGone, ...kept] = ids;

    const res = await remove(account.token, [gone, alsoGone]).expect(200);

    expect(res.body).toEqual({ handIds: [gone, alsoGone] });
    const page = await list(account.token);
    expect(page.hands.map((hand) => hand.id)).toEqual(kept);
    expect(page.counts.all).toBe(kept.length);
    const results = await request(running.httpServer)
      .get('/api/library/results')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);
    expect(results.body.hands).toBe(kept.length);
  });

  it('leaves the Hand, and its Notes, in another Account’s Library', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const text = freshHandHistory('pokerstars-showdown.txt');
    const [handId] = await importText(javier.token, text);
    await importText(marta.token, text);
    await request(running.httpServer)
      .post(`/api/library/hands/${handId}/notes`)
      .set('Authorization', `Bearer ${marta.token}`)
      .send({ body: 'Jam forzado.' })
      .expect(201);

    await remove(javier.token, [handId]).expect(200);

    expect((await list(javier.token)).total).toBe(0);
    expect((await list(marta.token)).hands.map((hand) => hand.id)).toEqual([
      handId,
    ]);
    const notes = await request(running.httpServer)
      .get(`/api/hands/${handId}/notes`)
      .set('Authorization', `Bearer ${marta.token}`)
      .expect(200);
    expect(notes.body.notes.map((note: { body: string }) => note.body)).toEqual(
      ['Jam forzado.'],
    );
    // Javier has it nowhere now.
    await request(running.httpServer)
      .get(`/api/hands/${handId}`)
      .set('Authorization', `Bearer ${javier.token}`)
      .expect(404);
  });

  it('takes the person’s Tags off the Hand, and gives a re-import none', async () => {
    const account = await newAccount(running.httpServer);
    const text = freshHandHistory('pokerstars-showdown.txt');
    const [handId] = await importText(account.token, text);
    const tag = await request(running.httpServer)
      .post('/api/library/tags')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'Multiway' })
      .expect(201);
    await request(running.httpServer)
      .put(`/api/library/tags/${tag.body.id}/hands`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ handIds: [handId] })
      .expect(200);

    await remove(account.token, [handId]).expect(200);

    expect((await list(account.token)).options.tags).toEqual([
      expect.objectContaining({ id: tag.body.id, hands: 0 }),
    ]);
    await importText(account.token, text);
    expect((await list(account.token)).hands).toEqual([
      expect.objectContaining({ id: handId, tags: [] }),
    ]);
  });

  it('leaves a Hand in an open Room’s Queue, and the Room keeps working', async () => {
    const master = await newAccount(running.httpServer);
    const text = freshHandHistory('pokerstars-showdown.txt');
    const [handId] = await importText(master.token, text);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' })
      .expect(201);
    const code = room.body.code as string;
    const socket = await RoomClient.connect(running.wsUrl, master.token);
    clients.push(socket);
    socket.send('room.join', { code, displayName: 'Javier' });
    await socket.next('room.snapshot');
    // The same Hand History, read into the Room, is the same Hand.
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text })
      .expect(201);
    await socket.next('queue.entriesAdded');

    await remove(master.token, [handId]).expect(200);

    socket.send('playback.load', { handId });
    expect(await socket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 0,
      hideOpponentNames: false,
    });
    socket.send('notes.write', { handId, body: 'Sigue en la sala.' });
    await socket.next('notes.written');
    // Still visible to its Participants while the Room is open.
    await request(running.httpServer)
      .get(`/api/hands/${handId}`)
      .set('Authorization', `Bearer ${master.token}`)
      .expect(200);
    const rejoined = await RoomClient.connect(running.wsUrl, master.token);
    clients.push(rejoined);
    rejoined.send('room.join', { code, displayName: 'Javier' });
    const snapshot = await rejoined.next<{
      queue: { handId: string }[];
    }>('room.snapshot');
    expect(snapshot.queue.map((entry) => entry.handId)).toEqual([handId]);
  });

  it('refuses, removing nothing, when a Hand is not in the person’s Library', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const [own] = await importText(
      javier.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    const [martas] = await importText(
      marta.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    for (const handIds of [
      [own, martas],
      [own, 'not-a-hand'],
    ]) {
      const res = await remove(javier.token, handIds).expect(404);
      expect(res.body).toEqual({ reason: 'hand-not-found' });
    }
    expect((await list(javier.token)).total).toBe(1);
    expect((await list(marta.token)).total).toBe(1);
  });

  it('refuses a selection that is not a list of Hand ids', async () => {
    const account = await newAccount(running.httpServer);

    for (const handIds of [undefined, [], 'abc', [7], Array(201).fill('x')]) {
      const res = await remove(account.token, handIds).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-hand-selection' });
    }
  });
});
