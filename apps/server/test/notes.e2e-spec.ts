import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface QueueEntry {
  id: string;
  handId: string;
  position: number;
}

interface Note {
  id: string;
  handId: string;
  writer: { identityId: string; displayName: string };
  body: string;
  writtenAt: string;
  editedAt: string | null;
}

describe('Notes and Marks (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  async function issueIdentity(): Promise<{ token: string; id: string }> {
    const res = await request(running.httpServer).post('/api/identities');
    return { token: res.body.token, id: res.body.identity.id };
  }

  async function createRoom(token: string): Promise<string> {
    const res = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    return res.body.code as string;
  }

  async function join(
    token: string,
    code: string,
    displayName: string,
  ): Promise<{
    socket: RoomClient;
    queue: QueueEntry[];
    notes: Note[];
    marks: string[];
  }> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    const snapshot = await socket.next<{
      queue: QueueEntry[];
      notes: Note[];
      marks: string[];
    }>('room.snapshot');
    return { socket, ...snapshot };
  }

  /** A Room with a Master, a Guest and two Hands in the Queue. */
  async function roomWithHands() {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    const masterRoom = await join(master.token, code, 'Javier');
    const guestRoom = await join(guest.token, code, 'Marta');
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    const { entries } = await masterRoom.socket.next<{
      entries: QueueEntry[];
    }>('queue.entriesAdded');
    await guestRoom.socket.next('queue.entriesAdded');
    return {
      master,
      guest,
      code,
      masterSocket: masterRoom.socket,
      guestSocket: guestRoom.socket,
      entries,
    };
  }

  describe('writing', () => {
    it('shows a Note to everyone in the Room, with its writer and date', async () => {
      const { guest, masterSocket, guestSocket, entries } =
        await roomWithHands();

      guestSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'Con 62 BB el jam de CO es forzado.',
      });

      for (const socket of [masterSocket, guestSocket]) {
        const { note } = await socket.next<{ note: Note }>('notes.written');
        expect(note).toMatchObject({
          handId: entries[0].handId,
          body: 'Con 62 BB el jam de CO es forzado.',
          writer: { identityId: guest.id, displayName: 'Marta' },
          writtenAt: running.clock.now().toISOString(),
          editedAt: null,
        });
      }
    });

    it('keeps several Notes on one Hand, and hands them to whoever joins', async () => {
      const { master, code, masterSocket, guestSocket, entries } =
        await roomWithHands();

      guestSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'El turn es la calle clave.',
      });
      await masterSocket.next('notes.written');
      masterSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'Yo pagaria con AQ sin proyecto.',
      });
      await masterSocket.next('notes.written');

      const arriving = await join(master.token, code, 'Javier');
      expect(
        arriving.notes.map((note) => [note.body, note.writer.displayName]),
      ).toEqual([
        ['El turn es la calle clave.', 'Marta'],
        ['Yo pagaria con AQ sin proyecto.', 'Javier'],
      ]);
    });

    it('refuses a Note on a Hand that is not in the Queue, and an empty one', async () => {
      const { guestSocket, entries } = await roomWithHands();

      guestSocket.send('notes.write', {
        handId: '2f1c2d38-0000-4000-8000-000000000000',
        body: 'Sobre una mano que no esta aqui.',
      });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'notes.write',
        reason: 'hand-not-in-queue',
      });

      guestSocket.send('notes.write', { handId: entries[0].handId, body: '  ' });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'notes.write',
        reason: 'invalid-note',
      });
    });
  });

  describe('editing and deleting', () => {
    /** A Room whose Guest has written one Note on the first Hand. */
    async function roomWithANote() {
      const room = await roomWithHands();
      room.guestSocket.send('notes.write', {
        handId: room.entries[0].handId,
        body: 'Con 62 BB el jam de CO es forzado.',
      });
      const { note } = await room.masterSocket.next<{ note: Note }>(
        'notes.written',
      );
      await room.guestSocket.next('notes.written');
      return { ...room, note };
    }

    it('lets the Master rewrite any Note, for everyone, marked as edited', async () => {
      const { masterSocket, guestSocket, note } = await roomWithANote();
      await running.clock.advance(60_000);

      masterSocket.send('notes.edit', { id: note.id, body: 'Jam forzado.' });

      for (const socket of [masterSocket, guestSocket]) {
        const edited = await socket.next<{ note: Note }>('notes.edited');
        expect(edited.note).toMatchObject({
          id: note.id,
          body: 'Jam forzado.',
          writer: note.writer,
          writtenAt: note.writtenAt,
          editedAt: running.clock.now().toISOString(),
        });
      }
    });

    it('refuses a Guest who tries to rewrite or delete a Note, and changes nothing', async () => {
      const { masterSocket, guestSocket, note } = await roomWithANote();

      guestSocket.send('notes.edit', { id: note.id, body: 'Mia, la reescribo.' });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'notes.edit',
        reason: 'not-master',
      });

      guestSocket.send('notes.remove', { id: note.id });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'notes.remove',
        reason: 'not-master',
      });

      expect(masterSocket.all('notes.edited')).toEqual([]);
      expect(masterSocket.all('notes.removed')).toEqual([]);
    });

    it('takes a deleted Note from everyone, and brings it back when the Master undoes in time', async () => {
      const { master, code, masterSocket, guestSocket, note } =
        await roomWithANote();

      masterSocket.send('notes.remove', { id: note.id });
      for (const socket of [masterSocket, guestSocket]) {
        expect(await socket.next('notes.removed')).toEqual({ id: note.id });
      }
      expect((await join(master.token, code, 'Javier')).notes).toEqual([]);

      await running.clock.advance(9_000);
      masterSocket.send('notes.undoRemoval', { id: note.id });

      for (const socket of [masterSocket, guestSocket]) {
        const restored = await socket.next<{ note: Note }>('notes.restored');
        expect(restored.note).toEqual(note);
      }
      expect((await join(master.token, code, 'Javier')).notes).toEqual([note]);
    });

    it('refuses to undo a deletion once 10 s have passed', async () => {
      const { masterSocket, note } = await roomWithANote();
      masterSocket.send('notes.remove', { id: note.id });
      await masterSocket.next('notes.removed');

      await running.clock.advance(10_001);
      masterSocket.send('notes.undoRemoval', { id: note.id });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'notes.undoRemoval',
        reason: 'undo-expired',
      });
    });
  });

  describe('outside a Room', () => {
    function readNotes(token: string, handId: string) {
      return request(running.httpServer)
        .get(`/api/hands/${handId}/notes`)
        .set('Authorization', `Bearer ${token}`);
    }

    it('keeps the Notes on the Hand once the Room is closed, for everyone who was in it', async () => {
      const { master, guest, masterSocket, guestSocket, entries } =
        await roomWithHands();
      guestSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'La conclusion del grupo.',
      });
      const { note } = await masterSocket.next<{ note: Note }>('notes.written');

      masterSocket.send('room.close');
      await guestSocket.next('room.closed');

      for (const person of [master, guest]) {
        const res = await readNotes(person.token, entries[0].handId).expect(200);
        expect(res.body.notes).toEqual([note]);
      }
    });

    it('hides the Notes of a Hand from someone who never saw it', async () => {
      const stranger = await issueIdentity();
      const { guestSocket, masterSocket, entries } = await roomWithHands();
      guestSocket.send('notes.write', {
        handId: entries[0].handId,
        body: 'La conclusion del grupo.',
      });
      await masterSocket.next('notes.written');

      const res = await readNotes(stranger.token, entries[0].handId).expect(404);
      expect(res.body.reason).toBe('hand-not-found');
    });
  });

  describe('Marks', () => {
    it('Marks a Hand for its person alone, and nobody else', async () => {
      const { master, guest, code, masterSocket, guestSocket, entries } =
        await roomWithHands();

      guestSocket.send('hand.setMark', {
        handId: entries[0].handId,
        marked: true,
      });

      expect(await guestSocket.next('hand.markChanged')).toEqual({
        handId: entries[0].handId,
        marked: true,
      });
      expect((await join(guest.token, code, 'Marta')).marks).toEqual([
        entries[0].handId,
      ]);
      expect((await join(master.token, code, 'Javier')).marks).toEqual([]);
      expect(masterSocket.all('hand.markChanged')).toEqual([]);
    });

    it('reaches the person\u2019s own other tabs, and takes the Mark off again', async () => {
      const { guest, code, guestSocket, entries } = await roomWithHands();
      const otherTab = await join(guest.token, code, 'Marta');

      guestSocket.send('hand.setMark', {
        handId: entries[0].handId,
        marked: true,
      });
      expect(await otherTab.socket.next('hand.markChanged')).toEqual({
        handId: entries[0].handId,
        marked: true,
      });

      guestSocket.send('hand.setMark', {
        handId: entries[0].handId,
        marked: false,
      });
      expect(await otherTab.socket.next('hand.markChanged')).toEqual({
        handId: entries[0].handId,
        marked: false,
      });
      expect((await join(guest.token, code, 'Marta')).marks).toEqual([]);
    });

    it('keeps a Mark once the Room is closed', async () => {
      const { guest, masterSocket, guestSocket, entries } =
        await roomWithHands();
      guestSocket.send('hand.setMark', {
        handId: entries[0].handId,
        marked: true,
      });
      await guestSocket.next('hand.markChanged');

      masterSocket.send('room.close');
      await guestSocket.next('room.closed');

      const res = await request(running.httpServer)
        .get(`/api/hands/${entries[0].handId}/notes`)
        .set('Authorization', `Bearer ${guest.token}`)
        .expect(200);
      expect(res.body.marked).toBe(true);
    });
  });
});