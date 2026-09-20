import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
}

interface Snapshot {
  participants: Participant[];
  queue: { handId: string }[];
  playback: { handId: string; actionIndex: number } | null;
}

/** More than this long without the Master connected and the role passes on. */
const GRACE_MS = 120_000;

describe('Master handover and failover (e2e)', () => {
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

  function roleOf(snapshot: Snapshot, identityId: string): string | undefined {
    return snapshot.participants.find((p) => p.identityId === identityId)?.role;
  }

  /** A Room with the Master and two Guests, each joined a second apart. */
  async function roomOfThree() {
    const master = await issueIdentity();
    const marta = await issueIdentity();
    const alberto = await issueIdentity();
    const code = await createRoom(master.token);
    const masterRoom = await join(master.token, code, 'Javier');
    await running.clock.advance(1_000);
    const martaRoom = await join(marta.token, code, 'Marta');
    await running.clock.advance(1_000);
    const albertoRoom = await join(alberto.token, code, 'Alberto');
    await masterRoom.socket.next('room.participantJoined');
    await masterRoom.socket.next('room.participantJoined');
    return {
      code,
      master,
      marta,
      alberto,
      masterSocket: masterRoom.socket,
      martaSocket: martaRoom.socket,
      albertoSocket: albertoRoom.socket,
    };
  }

  /** Puts a Hand in the Queue and takes Playback to its second Action. */
  async function playSomething(
    code: string,
    token: string,
    socket: RoomClient,
    others: RoomClient[],
  ): Promise<{ handId: string; actionIndex: number }> {
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    const { entries } = await socket.next<{ entries: { handId: string }[] }>(
      'queue.entriesAdded',
    );
    for (const other of others) await other.next('queue.entriesAdded');
    socket.send('playback.load', { handId: entries[0].handId });
    await socket.next('playback.changed');
    socket.send('playback.goTo', { actionIndex: 2 });
    const playback = await socket.next<{
      handId: string;
      actionIndex: number;
    }>('playback.changed');
    for (const other of others) {
      await other.next('playback.changed');
      await other.next('playback.changed');
    }
    return playback;
  }

  describe('handover', () => {
    it('gives the role to the named Participant and tells the whole Room', async () => {
      const {
        code,
        master,
        marta,
        alberto,
        masterSocket,
        martaSocket,
        albertoSocket,
      } = await roomOfThree();

      masterSocket.send('room.handOver', { identityId: marta.id });

      for (const socket of [masterSocket, martaSocket, albertoSocket]) {
        expect(await socket.next('room.masterChanged')).toEqual({
          masterId: marta.id,
          reason: 'handover',
        });
      }
      const { snapshot } = await join(alberto.token, code, 'Alberto');
      expect(roleOf(snapshot, marta.id)).toBe('master');
      expect(roleOf(snapshot, master.id)).toBe('guest');
      expect(roleOf(snapshot, alberto.id)).toBe('guest');
    });

    it('locks the former Master out of Playback and lets the new one drive', async () => {
      const { code, master, marta, masterSocket, martaSocket, albertoSocket } =
        await roomOfThree();
      const playback = await playSomething(code, master.token, masterSocket, [
        martaSocket,
        albertoSocket,
      ]);

      masterSocket.send('room.handOver', { identityId: marta.id });
      await masterSocket.next('room.masterChanged');
      await martaSocket.next('room.masterChanged');
      await albertoSocket.next('room.masterChanged');

      masterSocket.send('playback.goTo', { actionIndex: 0 });
      expect(await masterSocket.next('rejected')).toEqual({
        command: 'playback.goTo',
        reason: 'not-master',
      });
      martaSocket.send('playback.goTo', { actionIndex: 3 });
      expect(await albertoSocket.next('playback.changed')).toEqual({
        handId: playback.handId,
        actionIndex: 3,
      });
    });

    it('keeps Playback on its Hand and Action', async () => {
      const { code, master, marta, masterSocket, martaSocket, albertoSocket } =
        await roomOfThree();
      const playback = await playSomething(code, master.token, masterSocket, [
        martaSocket,
        albertoSocket,
      ]);

      masterSocket.send('room.handOver', { identityId: marta.id });
      await masterSocket.next('room.masterChanged');

      expect(masterSocket.all('playback.changed')).toEqual([]);
      const { snapshot } = await join(marta.token, code, 'Marta');
      expect(snapshot.playback).toEqual(playback);
      expect(roleOf(snapshot, marta.id)).toBe('master');
      expect(roleOf(snapshot, master.id)).toBe('guest');
    });

    it('refuses a Guest who tries to take the role', async () => {
      const { alberto, masterSocket, martaSocket } = await roomOfThree();

      martaSocket.send('room.handOver', { identityId: alberto.id });

      expect(await martaSocket.next('rejected')).toEqual({
        command: 'room.handOver',
        reason: 'not-master',
      });
      expect(masterSocket.all('room.masterChanged')).toEqual([]);
    });

    it('refuses someone who is not a Participant of the Room', async () => {
      const { masterSocket } = await roomOfThree();
      const stranger = await issueIdentity();

      masterSocket.send('room.handOver', { identityId: stranger.id });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'room.handOver',
        reason: 'not-a-participant',
      });
    });

    it('refuses handing the role to the Master themselves', async () => {
      const { master, masterSocket } = await roomOfThree();

      masterSocket.send('room.handOver', { identityId: master.id });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'room.handOver',
        reason: 'already-master',
      });
    });
  });

  describe('failover', () => {
    it('passes the role to the Participant present the longest, and tells the Room', async () => {
      const { marta, masterSocket, martaSocket, albertoSocket } =
        await roomOfThree();

      await masterSocket.close();
      await martaSocket.next('room.participantLeft');
      await running.clock.advance(GRACE_MS - 1_000);
      expect(martaSocket.all('room.masterChanged')).toEqual([]);

      await running.clock.advance(1_000);
      for (const socket of [martaSocket, albertoSocket]) {
        expect(await socket.next('room.masterChanged')).toEqual({
          masterId: marta.id,
          reason: 'failover',
        });
      }
    });

    it('leaves the role where it is when the Master comes back in time', async () => {
      const { code, master, masterSocket, martaSocket } = await roomOfThree();

      await masterSocket.close();
      await martaSocket.next('room.participantLeft');
      await running.clock.advance(GRACE_MS - 1_000);
      const rejoin = await join(master.token, code, 'Javier');
      await running.clock.advance(GRACE_MS * 2);

      expect(rejoin.snapshot.participants).toContainEqual({
        identityId: master.id,
        displayName: 'Javier',
        role: 'master',
      });
      expect(martaSocket.all('room.masterChanged')).toEqual([]);
    });

    it('takes a former Master back as a Guest', async () => {
      const { code, master, marta, masterSocket, martaSocket } =
        await roomOfThree();

      await masterSocket.close();
      await martaSocket.next('room.participantLeft');
      await running.clock.advance(GRACE_MS);
      await martaSocket.next('room.masterChanged');

      const rejoin = await join(master.token, code, 'Javier');
      expect(roleOf(rejoin.snapshot, master.id)).toBe('guest');
      expect(roleOf(rejoin.snapshot, marta.id)).toBe('master');
      rejoin.socket.send('playback.load', { handId: crypto.randomUUID() });
      expect(await rejoin.socket.next('rejected')).toEqual({
        command: 'playback.load',
        reason: 'not-master',
      });
    });

    it('waits for someone to be there before passing the role on', async () => {
      const { code, master, marta, alberto, masterSocket, martaSocket, albertoSocket } =
        await roomOfThree();

      await Promise.all([
        masterSocket.close(),
        martaSocket.close(),
        albertoSocket.close(),
      ]);
      await running.clock.advance(GRACE_MS * 2);
      const rejoin = await join(marta.token, code, 'Marta');

      expect(roleOf(rejoin.snapshot, marta.id)).toBe('master');
      const alone = await join(alberto.token, code, 'Alberto');
      expect(roleOf(alone.snapshot, marta.id)).toBe('master');
      expect(roleOf(alone.snapshot, master.id)).toBeUndefined();
    });
  });
});
