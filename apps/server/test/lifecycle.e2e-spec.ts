import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
  screenNames: string[];
}

interface Snapshot {
  room: { code: string; name: string };
  you: string;
  participants: Participant[];
  queue: { id: string; handId: string }[];
}

/** This long with nobody connected and a Room closes on its own. */
const ABANDONED_MS = 30 * 60_000;

describe('Room lifecycle: leave, kick and close (e2e)', () => {
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
      .send({ name: 'Martes NL50', displayName: 'Javier' });
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

  /** A Room with its Master and one Guest, both connected. */
  async function roomOfTwo() {
    const master = await issueIdentity();
    const marta = await issueIdentity();
    const code = await createRoom(master.token);
    const masterRoom = await join(master.token, code, 'Javier');
    const martaRoom = await join(marta.token, code, 'Marta');
    await masterRoom.socket.next('room.participantJoined');
    return {
      code,
      master,
      marta,
      masterSocket: masterRoom.socket,
      martaSocket: martaRoom.socket,
    };
  }

  /**
   * Waits for the server to have seen every connection of a Room go. Closing
   * a socket reaches the server a moment after the client sees it close.
   */
  async function untilEmpty(token: string, code: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const res = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${token}`);
      const room = (res.body as { code: string; live: boolean }[]).find(
        (open) => open.code === code,
      );
      if (!room?.live) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Room ${code} still has someone connected`);
  }

  /** Puts one Hand in the Room's Queue, imported by `token`. */
  async function queueAHand(
    code: string,
    token: string,
    sockets: RoomClient[],
  ): Promise<string> {
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    let handId = '';
    for (const socket of sockets) {
      const { entries } = await socket.next<{ entries: { handId: string }[] }>(
        'queue.entriesAdded',
      );
      handId = entries[0].handId;
    }
    return handId;
  }

  describe('leaving', () => {
    it('lets a Guest walk out and tells the Room', async () => {
      const { marta, masterSocket, martaSocket } = await roomOfTwo();

      martaSocket.send('room.leave');

      expect(await masterSocket.next('room.participantLeft')).toEqual({
        identityId: marta.id,
      });
      expect(martaSocket.all('rejected')).toEqual([]);
    });

    it('refuses to let the Master simply leave', async () => {
      const { master, masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.leave');

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'room.leave',
        reason: 'master-must-choose',
      });
      expect(martaSocket.all('room.participantLeft')).toEqual([]);
      expect(master.id).toBeDefined();
    });

    it('lets a former Master leave once the role is handed over', async () => {
      const { master, marta, masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.handOver', { identityId: marta.id });
      await masterSocket.next('room.masterChanged');
      await martaSocket.next('room.masterChanged');
      masterSocket.send('room.leave');

      expect(await martaSocket.next('room.participantLeft')).toEqual({
        identityId: master.id,
      });
      expect(masterSocket.all('rejected')).toEqual([]);
    });
  });

  describe('kicking', () => {
    it('takes the kicked Participant out and tells the whole Room', async () => {
      const { marta, masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.kick', { identityId: marta.id });

      for (const socket of [masterSocket, martaSocket]) {
        expect(await socket.next('room.participantKicked')).toEqual({
          identityId: marta.id,
        });
      }
    });

    it('stops the kicked identity coming back to that Room', async () => {
      const { code, marta, masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.kick', { identityId: marta.id });
      await martaSocket.next('room.participantKicked');

      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(403, { reason: 'kicked-from-room' });
      const back = await RoomClient.connect(running.wsUrl, marta.token);
      clients.push(back);
      back.send('room.join', { code, displayName: 'Marta' });
      expect(await back.next('rejected')).toEqual({
        command: 'room.join',
        reason: 'kicked-from-room',
      });
    });

    it('leaves the kicked Participant’s Queue Entries in the Queue', async () => {
      const { code, master, marta, masterSocket, martaSocket } =
        await roomOfTwo();
      const handId = await queueAHand(code, marta.token, [
        masterSocket,
        martaSocket,
      ]);

      const before = (await join(master.token, code, 'Javier')).snapshot.queue;

      masterSocket.send('room.kick', { identityId: marta.id });
      await masterSocket.next('room.participantKicked');

      const alberto = await issueIdentity();
      const { snapshot } = await join(alberto.token, code, 'Alberto');
      expect(snapshot.queue.map((entry) => entry.id)).toEqual(
        before.map((entry) => entry.id),
      );
      expect(snapshot.queue.map((entry) => entry.handId)).toContain(handId);
      // The Master can still drive it, Author gone or not.
      masterSocket.send('playback.load', { handId });
      expect(await masterSocket.next('playback.changed')).toEqual({
        handId,
        actionIndex: 0,
        hideOpponentNames: false,
      });
    });

    it('refuses a Guest who tries to kick, and the Master kicking themselves', async () => {
      const { master, marta, masterSocket, martaSocket } = await roomOfTwo();

      martaSocket.send('room.kick', { identityId: master.id });
      expect(await martaSocket.next('rejected')).toEqual({
        command: 'room.kick',
        reason: 'not-master',
      });

      masterSocket.send('room.kick', { identityId: master.id });
      expect(await masterSocket.next('rejected')).toEqual({
        command: 'room.kick',
        reason: 'cannot-kick-yourself',
      });
      expect(masterSocket.all('room.participantKicked')).toEqual([]);
      expect(marta.id).toBeDefined();
    });

    it('refuses kicking someone who is not a Participant', async () => {
      const { masterSocket } = await roomOfTwo();
      const stranger = await issueIdentity();

      masterSocket.send('room.kick', { identityId: stranger.id });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'room.kick',
        reason: 'not-a-participant',
      });
    });
  });

  describe('closing', () => {
    it('tells every Participant the Room has closed', async () => {
      const { masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.close');

      for (const socket of [masterSocket, martaSocket]) {
        expect(await socket.next('room.closed')).toEqual({});
      }
    });

    it('stops the Room Code working, for good', async () => {
      const { code, master, marta, masterSocket } = await roomOfTwo();

      masterSocket.send('room.close');
      await masterSocket.next('room.closed');

      for (const who of [master, marta]) {
        await request(running.httpServer)
          .get(`/api/rooms/${code}`)
          .set('Authorization', `Bearer ${who.token}`)
          .expect(404, { reason: 'room-not-found' });
      }
      const back = await RoomClient.connect(running.wsUrl, master.token);
      clients.push(back);
      back.send('room.join', { code, displayName: 'Javier' });
      expect(await back.next('rejected')).toEqual({
        command: 'room.join',
        reason: 'room-not-found',
      });
    });

    it('refuses a Guest who tries to close the Room', async () => {
      const { masterSocket, martaSocket } = await roomOfTwo();

      martaSocket.send('room.close');

      expect(await martaSocket.next('rejected')).toEqual({
        command: 'room.close',
        reason: 'not-master',
      });
      expect(masterSocket.all('room.closed')).toEqual([]);
    });

    it('leaves the Hands it reviewed reachable afterwards', async () => {
      const { code, master, marta, masterSocket, martaSocket } =
        await roomOfTwo();
      const handId = await queueAHand(code, marta.token, [
        masterSocket,
        martaSocket,
      ]);

      masterSocket.send('room.close');
      await masterSocket.next('room.closed');

      for (const who of [master, marta]) {
        await request(running.httpServer)
          .get(`/api/hands/${handId}`)
          .set('Authorization', `Bearer ${who.token}`)
          .expect(200);
      }
    });
  });

  describe('a Room nobody is connected to', () => {
    it('closes itself once the whole period has passed', async () => {
      const { code, master, masterSocket, martaSocket } = await roomOfTwo();

      await Promise.all([masterSocket.close(), martaSocket.close()]);
      await untilEmpty(master.token, code);
      await running.clock.advance(ABANDONED_MS - 1_000);
      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${master.token}`)
        .expect(200);

      await running.clock.advance(1_000);
      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${master.token}`)
        .expect(404, { reason: 'room-not-found' });
    });

    it('stays open when someone comes back in time', async () => {
      const { code, master, masterSocket, martaSocket } = await roomOfTwo();

      await Promise.all([masterSocket.close(), martaSocket.close()]);
      await untilEmpty(master.token, code);
      await running.clock.advance(ABANDONED_MS - 1_000);
      const back = await join(master.token, code, 'Javier');
      await running.clock.advance(ABANDONED_MS * 2);

      expect(back.snapshot.room.code).toBe(code);
      expect(back.socket.all('room.closed')).toEqual([]);
      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${master.token}`)
        .expect(200);
    });

    it('closes a Room that was created and never joined', async () => {
      const master = await issueIdentity();
      const code = await createRoom(master.token);

      await running.clock.advance(ABANDONED_MS);

      await request(running.httpServer)
        .get(`/api/rooms/${code}`)
        .set('Authorization', `Bearer ${master.token}`)
        .expect(404, { reason: 'room-not-found' });
    });
  });

  describe('the Rooms someone can go back to', () => {
    it('lists only the open Rooms they have been in, newest first', async () => {
      const marta = await issueIdentity();
      const first = await roomOfTwo();
      await join(marta.token, first.code, 'Marta');
      await running.clock.advance(1_000);
      const second = await roomOfTwo();
      const joined = await join(marta.token, second.code, 'Marta');

      second.masterSocket.send('room.close');
      await joined.socket.next('room.closed');

      const mine = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(200);
      expect(mine.body).toEqual([
        {
          code: first.code,
          name: 'Martes NL50',
          live: true,
          joinedAt: expect.any(String),
        },
      ]);
    });

    it('leaves out a Room they were kicked from', async () => {
      const { code, marta, masterSocket, martaSocket } = await roomOfTwo();

      masterSocket.send('room.kick', { identityId: marta.id });
      await martaSocket.next('room.participantKicked');

      const mine = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${marta.token}`)
        .expect(200);
      expect(mine.body).toEqual([]);
      expect(code).toBeDefined();
    });

    it('says a Room is no longer live once everyone has gone', async () => {
      const { code, master, masterSocket, martaSocket } = await roomOfTwo();

      await Promise.all([masterSocket.close(), martaSocket.close()]);
      await untilEmpty(master.token, code);

      const mine = await request(running.httpServer)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${master.token}`)
        .expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ code, live: false }),
      ]);
    });
  });
});
