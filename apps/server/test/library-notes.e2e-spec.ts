import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Note {
  id: string;
  handId: string;
  writer: { identityId: string; displayName: string };
  body: string;
  writtenAt: string;
  editedAt: string | null;
}

describe('Notes from the Library (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  /** A fresh Account that goes by `displayName`. */
  async function person(displayName: string) {
    const account = await newAccount(running.httpServer);
    await request(running.httpServer)
      .put('/api/identities/me/display-name')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ displayName })
      .expect(200);
    return account;
  }

  /** Imports `text` into `token`'s Library and returns its Hands' ids. */
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
    const page = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (page.body.hands as { id: string }[]).map((hand) => hand.id);
  }

  function readNotes(token: string, handId: string) {
    return request(running.httpServer)
      .get(`/api/hands/${handId}/notes`)
      .set('Authorization', `Bearer ${token}`);
  }

  function write(token: string, handId: string, body: unknown) {
    return request(running.httpServer)
      .post(`/api/library/hands/${handId}/notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body });
  }

  function edit(token: string, noteId: string, body: unknown) {
    return request(running.httpServer)
      .patch(`/api/library/notes/${noteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body });
  }

  function remove(token: string, noteId: string) {
    return request(running.httpServer)
      .delete(`/api/library/notes/${noteId}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function undoRemoval(token: string, noteId: string) {
    return request(running.httpServer)
      .post(`/api/library/notes/${noteId}/restore`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** Two Accounts sharing one Hand in their Libraries, with a Note by Marta on it. */
  async function sharedHandWithANote() {
    const javier = await person('Javier');
    const marta = await person('Marta');
    const text = freshHandHistory('pokerstars-session.txt');
    const [handId] = await importText(javier.token, text);
    await importText(marta.token, text);
    const written = await write(
      marta.token,
      handId,
      'Con 62 BB el jam de CO es forzado.',
    ).expect(201);
    return { javier, marta, handId, text, note: written.body as Note };
  }

  it('writes a Note on a Hand of the Library, for everyone who has the Hand', async () => {
    const { javier, marta, handId, note } = await sharedHandWithANote();

    expect(note).toEqual({
      id: expect.any(String),
      seq: expect.any(Number),
      handId,
      writer: { identityId: marta.id, displayName: 'Marta' },
      body: 'Con 62 BB el jam de CO es forzado.',
      writtenAt: running.clock.now().toISOString(),
      editedAt: null,
    });
    for (const person of [javier, marta]) {
      const res = await readNotes(person.token, handId).expect(200);
      expect(res.body.notes).toEqual([note]);
    }
  });

  it('lets anyone who has the Hand rewrite any of its Notes, marked as edited', async () => {
    const { javier, marta, handId, note } = await sharedHandWithANote();
    await running.clock.advance(60_000);

    const res = await edit(javier.token, note.id, ' Jam forzado. ').expect(200);

    expect(res.body).toEqual({
      ...note,
      body: 'Jam forzado.',
      editedAt: running.clock.now().toISOString(),
    });
    expect((await readNotes(marta.token, handId)).body.notes).toEqual([
      res.body,
    ]);
    await edit(javier.token, note.id, '  ').expect(400);
  });

  it('deletes any Note for everyone, and brings it back when undone within 10 s', async () => {
    const { javier, marta, handId, note } = await sharedHandWithANote();

    expect((await remove(javier.token, note.id).expect(200)).body).toEqual({
      id: note.id,
    });
    expect((await readNotes(marta.token, handId)).body.notes).toEqual([]);
    await edit(javier.token, note.id, 'Ya no esta.').expect(404);

    await running.clock.advance(9_000);
    const restored = await undoRemoval(marta.token, note.id).expect(201);

    expect(restored.body).toEqual(note);
    expect((await readNotes(javier.token, handId)).body.notes).toEqual([note]);
  });

  it('refuses to undo a deletion once 10 s have passed, or one never made', async () => {
    const { javier, note } = await sharedHandWithANote();
    expect(
      (await undoRemoval(javier.token, note.id).expect(404)).body.reason,
    ).toBe('nothing-to-undo');
    await remove(javier.token, note.id).expect(200);

    await running.clock.advance(10_001);

    expect(
      (await undoRemoval(javier.token, note.id).expect(409)).body.reason,
    ).toBe('undo-expired');
  });

  it('refuses anyone without the Hand in their Library, and changes nothing', async () => {
    const { javier, handId, note } = await sharedHandWithANote();
    const stranger = await person('Lucia');

    expect(
      (await write(stranger.token, handId, 'Intruso.').expect(404)).body.reason,
    ).toBe('hand-not-found');
    expect(
      (await edit(stranger.token, note.id, 'Intruso.').expect(404)).body.reason,
    ).toBe('note-not-found');
    expect(
      (await remove(stranger.token, note.id).expect(404)).body.reason,
    ).toBe('note-not-found');
    await remove(javier.token, note.id).expect(200);
    expect(
      (await undoRemoval(stranger.token, note.id).expect(404)).body.reason,
    ).toBe('nothing-to-undo');
  });

  describe('and Rooms', () => {
    async function createRoom(token: string): Promise<string> {
      const res = await request(running.httpServer)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Martes NL10', displayName: 'Javier' })
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

    /** Javier holds a Room whose Queue holds the Hand he and Marta share. */
    async function roomReviewingTheHand() {
      const shared = await sharedHandWithANote();
      const code = await createRoom(shared.javier.token);
      const javierSocket = await join(shared.javier.token, code, 'Javier');
      const martaSocket = await join(shared.marta.token, code, 'Marta');
      // The same Hand History, read into the Room, is the same Hand.
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${shared.javier.token}`)
        .send({ text: shared.text })
        .expect(201);
      const { entries } = await javierSocket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');
      expect(entries.map((entry) => entry.handId)).toContain(shared.handId);
      await martaSocket.next('queue.entriesAdded');
      return { ...shared, code, javierSocket, martaSocket };
    }

    it('shows a Note written, rewritten or deleted from the Library in a Room reviewing the Hand', async () => {
      const { marta, handId, note, javierSocket } =
        await roomReviewingTheHand();

      const written = await write(marta.token, handId, 'Desde casa.').expect(
        201,
      );
      expect(await javierSocket.next('notes.written')).toEqual({
        note: written.body,
      });

      const edited = await edit(marta.token, note.id, 'Jam forzado.').expect(
        200,
      );
      expect(await javierSocket.next('notes.edited')).toEqual({
        note: edited.body,
      });

      await remove(marta.token, note.id).expect(200);
      expect(await javierSocket.next('notes.removed')).toEqual({ id: note.id });
      await undoRemoval(marta.token, note.id).expect(201);
      expect(await javierSocket.next('notes.restored')).toEqual({
        note: edited.body,
      });
    });

    it('still lets only the Master rewrite or delete inside the Room', async () => {
      const { note, martaSocket } = await roomReviewingTheHand();

      martaSocket.send('notes.edit', { id: note.id, body: 'Mia.' });
      expect(await martaSocket.next('rejected')).toEqual({
        command: 'notes.edit',
        reason: 'not-master',
      });
      martaSocket.send('notes.remove', { id: note.id });
      expect(await martaSocket.next('rejected')).toEqual({
        command: 'notes.remove',
        reason: 'not-master',
      });
    });
  });
});
