import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface QueueEntry {
  id: string;
  handId: string;
  position: number;
  author: { identityId: string; displayName: string };
}

describe('Queue management (e2e)', () => {
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
  ): Promise<{ socket: RoomClient; queue: QueueEntry[] }> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    const snapshot = await socket.next<{ queue: QueueEntry[] }>(
      'room.snapshot',
    );
    return { socket, queue: snapshot.queue };
  }

  function paste(token: string, code: string, text: string) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text });
  }

  /** A Room with two Participants and four Queue Entries, positions 1-4. */
  async function roomWithFourHands() {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    const masterRoom = await join(master.token, code, 'Javier');
    const guestRoom = await join(guest.token, code, 'Marta');
    const text = freshHandHistory('pokerstars-session.txt');
    await paste(master.token, code, text).expect(201);
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
      text,
    };
  }

  describe('reordering', () => {
    it('puts the Queue in the order the Master gives, the same for everyone', async () => {
      const { master, code, masterSocket, guestSocket, entries } =
        await roomWithFourHands();
      const order = [
        entries[2].id,
        entries[0].id,
        entries[3].id,
        entries[1].id,
      ];

      masterSocket.send('queue.reorder', { order });

      for (const socket of [masterSocket, guestSocket]) {
        expect(await socket.next('queue.reordered')).toEqual({ order });
      }
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue.map((entry) => entry.id)).toEqual(order);
      expect(queue.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    });

    it('never changes the loaded Hand', async () => {
      const { masterSocket, guestSocket, entries } = await roomWithFourHands();
      masterSocket.send('playback.load', { handId: entries[0].handId });
      await masterSocket.next('playback.changed');
      await guestSocket.next('playback.changed');

      masterSocket.send('queue.reorder', {
        order: [entries[3].id, entries[2].id, entries[1].id, entries[0].id],
      });
      await masterSocket.next('queue.reordered');

      expect(masterSocket.all('playback.changed')).toEqual([]);
    });

    it('refuses a Guest, and changes nothing', async () => {
      const { masterSocket, guestSocket, entries } = await roomWithFourHands();

      guestSocket.send('queue.reorder', {
        order: entries.map((entry) => entry.id).reverse(),
      });

      expect(await guestSocket.next('rejected')).toEqual({
        command: 'queue.reorder',
        reason: 'not-master',
      });
      expect(masterSocket.all('queue.reordered')).toEqual([]);
    });

    it('refuses an order that is not exactly the active Entries', async () => {
      const { masterSocket, entries } = await roomWithFourHands();

      masterSocket.send('queue.reorder', {
        order: [entries[0].id, entries[1].id, entries[2].id],
      });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'queue.reorder',
        reason: 'invalid-queue-order',
      });
    });

    it('refuses an order that repeats an id in place of another active Entry', async () => {
      const { masterSocket, entries } = await roomWithFourHands();

      masterSocket.send('queue.reorder', {
        order: [entries[2].id, entries[0].id, entries[3].id, entries[2].id],
      });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'queue.reorder',
        reason: 'invalid-queue-order',
      });
    });
  });

  describe('removing and undoing', () => {
    it('removes a Queue Entry for everyone, without deleting the Hand', async () => {
      const { master, code, masterSocket, guestSocket, entries } =
        await roomWithFourHands();

      masterSocket.send('queue.remove', { id: entries[1].id });

      for (const socket of [masterSocket, guestSocket]) {
        expect(await socket.next('queue.entryRemoved')).toEqual({
          id: entries[1].id,
        });
      }
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue.map((entry) => entry.id)).toEqual([
        entries[0].id,
        entries[2].id,
        entries[3].id,
      ]);
      const hand = await request(running.httpServer)
        .get(`/api/hands/${entries[1].handId}`)
        .set('Authorization', `Bearer ${master.token}`);
      expect(hand.status).toBe(200);
    });

    it('leaves Playback untouched when the loaded Hand is removed', async () => {
      const { masterSocket, guestSocket, entries } = await roomWithFourHands();
      masterSocket.send('playback.load', { handId: entries[1].handId });
      await masterSocket.next('playback.changed');
      await guestSocket.next('playback.changed');

      masterSocket.send('queue.remove', { id: entries[1].id });
      await masterSocket.next('queue.entryRemoved');

      expect(masterSocket.all('playback.changed')).toEqual([]);
    });

    it('restores the removed Entry at its position when the Master undoes in time, seen by a Guest too', async () => {
      const { master, code, masterSocket, guestSocket, entries } =
        await roomWithFourHands();
      masterSocket.send('queue.remove', { id: entries[1].id });
      await masterSocket.next('queue.entryRemoved');
      await guestSocket.next('queue.entryRemoved');

      masterSocket.send('queue.undoRemoval', { id: entries[1].id });

      for (const socket of [masterSocket, guestSocket]) {
        const { entry } = await socket.next<{ entry: QueueEntry }>(
          'queue.entryRestored',
        );
        expect(entry.id).toBe(entries[1].id);
      }
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue.map((entry) => entry.id)).toEqual(
        entries.map((entry) => entry.id),
      );
    });

    it('never leaves two active Entries sharing a position after a reorder happens while one is removed', async () => {
      const { master, code, masterSocket, entries } =
        await roomWithFourHands();
      masterSocket.send('queue.remove', { id: entries[1].id });
      await masterSocket.next('queue.entryRemoved');
      masterSocket.send('queue.reorder', {
        order: [entries[3].id, entries[2].id, entries[0].id],
      });
      await masterSocket.next('queue.reordered');

      masterSocket.send('queue.undoRemoval', { id: entries[1].id });
      await masterSocket.next('queue.entryRestored');

      const { queue } = await join(master.token, code, 'Javier');
      expect(queue).toHaveLength(4);
      expect(new Set(queue.map((entry) => entry.position)).size).toBe(4);
      expect(queue.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    });

    it('refuses to undo once 10 s have passed, using the injected clock', async () => {
      const { masterSocket, entries } = await roomWithFourHands();
      masterSocket.send('queue.remove', { id: entries[1].id });
      await masterSocket.next('queue.entryRemoved');

      await running.clock.advance(9_999);
      masterSocket.send('queue.undoRemoval', { id: entries[1].id });
      const { entry } = await masterSocket.next<{ entry: QueueEntry }>(
        'queue.entryRestored',
      );
      expect(entry.id).toBe(entries[1].id);

      masterSocket.send('queue.remove', { id: entries[2].id });
      await masterSocket.next('queue.entryRemoved');
      await running.clock.advance(10_001);

      masterSocket.send('queue.undoRemoval', { id: entries[2].id });
      expect(await masterSocket.next('rejected')).toEqual({
        command: 'queue.undoRemoval',
        reason: 'undo-expired',
      });
    });

    it('refuses a Guest who tries to remove or undo, and changes nothing', async () => {
      const { masterSocket, guestSocket, entries } = await roomWithFourHands();

      guestSocket.send('queue.remove', { id: entries[0].id });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'queue.remove',
        reason: 'not-master',
      });
      expect(masterSocket.all('queue.entryRemoved')).toEqual([]);

      masterSocket.send('queue.remove', { id: entries[0].id });
      await masterSocket.next('queue.entryRemoved');
      guestSocket.send('queue.undoRemoval', { id: entries[0].id });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'queue.undoRemoval',
        reason: 'not-master',
      });
    });

    it('lets a Hand whose Entry was removed be imported again, as a new Entry', async () => {
      const { master, code, masterSocket, entries, text } =
        await roomWithFourHands();
      masterSocket.send('queue.remove', { id: entries[1].id });
      await masterSocket.next('queue.entryRemoved');
      await running.clock.advance(10_001);

      // The other three Hands of the same session are already queued and are
      // reported as duplicates; the removed one is not, and comes back in.
      const again = await paste(master.token, code, text).expect(201);

      expect(again.body.imported).toBe(1);
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue).toHaveLength(4);
      const restored = queue.filter((entry) => entry.handId === entries[1].handId);
      expect(restored).toHaveLength(1);
      expect(restored[0].id).not.toBe(entries[1].id);
    });
  });
});
