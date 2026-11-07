import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Playback {
  handId: string;
  actionIndex: number;
  hideOpponentNames: boolean;
}

interface Snapshot {
  state: 'free-review' | 'live';
  playback: Playback | null;
  revision: number;
}

describe('Free Review and Live (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

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

  /** A Room with its Master, one Guest and the showdown Hand in its Queue. */
  async function roomWithAHand() {
    const master = await newAccount(running.httpServer);
    const guest = await newAccount(running.httpServer);
    const created = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const code = created.body.code as string;
    const { socket: masterSocket } = await join(master.token, code, 'Javier');
    const { socket: guestSocket, snapshot } = await join(
      guest.token,
      code,
      'Marta',
    );
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text: freshHandHistory('pokerstars-showdown.txt') })
      .expect(201);
    const { entries } = await masterSocket.next<{
      entries: { handId: string }[];
    }>('queue.entriesAdded');
    await guestSocket.next('queue.entriesAdded');
    return {
      code,
      master,
      guest,
      masterSocket,
      guestSocket,
      snapshot,
      handId: entries[0].handId,
    };
  }

  it('starts a Room in Free Review, with no shared Playback', async () => {
    const { snapshot } = await roomWithAHand();

    expect(snapshot.state).toBe('free-review');
    expect(snapshot.playback).toBeNull();
  });

  it('refuses every Playback command outside Live', async () => {
    const { masterSocket, handId } = await roomWithAHand();

    masterSocket.send('playback.load', { handId });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.load',
      reason: 'not-live',
    });
    masterSocket.send('playback.goTo', { actionIndex: 1 });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.goTo',
      reason: 'not-live',
    });
    masterSocket.send('playback.hideOpponentNames', { hidden: true });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.hideOpponentNames',
      reason: 'not-live',
    });
  });

  it('starts Live from the Hand and Action the Master is on, for everyone', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();

    masterSocket.send('live.start', { handId, actionIndex: 4 });

    const expected = {
      playback: { handId, actionIndex: 4, hideOpponentNames: false },
    };
    for (const socket of [masterSocket, guestSocket]) {
      const started = await socket.nextMessage('live.started');
      expect(started.data).toEqual(expected);
      expect(started.revision).toEqual(expect.any(Number));
    }

    masterSocket.send('playback.goTo', { actionIndex: 2 });
    expect(await guestSocket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 2,
      hideOpponentNames: false,
    });
  });

  it('starts Live with no Hand loaded when the Master is on none', async () => {
    const { code, guest, masterSocket, guestSocket } = await roomWithAHand();

    masterSocket.send('live.start', {});
    expect(await guestSocket.next('live.started')).toEqual({ playback: null });

    const { snapshot } = await join(guest.token, code, 'Marta');
    expect(snapshot.state).toBe('live');
    expect(snapshot.playback).toBeNull();
  });

  it('lands someone joining a Live Room on the shared Playback', async () => {
    const { code, guest, masterSocket, handId } = await roomWithAHand();
    masterSocket.send('live.start', { handId, actionIndex: 3 });
    await masterSocket.next('live.started');

    const { snapshot } = await join(guest.token, code, 'Marta');

    expect(snapshot.state).toBe('live');
    expect(snapshot.playback).toEqual({
      handId,
      actionIndex: 3,
      hideOpponentNames: false,
    });
  });

  it('ends Live for everyone, back in Free Review with no shared Playback', async () => {
    const { code, guest, masterSocket, guestSocket, handId } =
      await roomWithAHand();
    masterSocket.send('live.start', { handId, actionIndex: 0 });
    await guestSocket.next('live.started');

    masterSocket.send('live.end');
    for (const socket of [masterSocket, guestSocket]) {
      const ended = await socket.nextMessage('live.ended');
      expect(ended.data).toEqual({});
      expect(ended.revision).toEqual(expect.any(Number));
    }

    const { snapshot } = await join(guest.token, code, 'Marta');
    expect(snapshot.state).toBe('free-review');
    expect(snapshot.playback).toBeNull();
    masterSocket.send('playback.goTo', { actionIndex: 1 });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.goTo',
      reason: 'not-live',
    });
  });

  it('starts and ends Live as many times as the Master likes', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();

    for (let round = 0; round < 2; round++) {
      masterSocket.send('live.start', { handId, actionIndex: round });
      await guestSocket.next('live.started');
      masterSocket.send('live.end');
      await guestSocket.next('live.ended');
    }
  });

  it('lets only the Master start or end Live', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();

    guestSocket.send('live.start', { handId, actionIndex: 0 });
    expect(await guestSocket.next('rejected')).toEqual({
      command: 'live.start',
      reason: 'not-master',
    });

    masterSocket.send('live.start', { handId, actionIndex: 0 });
    await guestSocket.next('live.started');
    guestSocket.send('live.end');
    expect(await guestSocket.next('rejected')).toEqual({
      command: 'live.end',
      reason: 'not-master',
    });
  });

  it('refuses starting Live twice, ending it in Free Review, a Hand not in the Queue and an Action outside the Hand', async () => {
    const { masterSocket, handId } = await roomWithAHand();

    masterSocket.send('live.end');
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'live.end',
      reason: 'not-live',
    });
    masterSocket.send('live.start', {
      handId: '00000000-0000-4000-8000-000000000000',
      actionIndex: 0,
    });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'live.start',
      reason: 'hand-not-in-queue',
    });
    masterSocket.send('live.start', { handId, actionIndex: 9_999 });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'live.start',
      reason: 'invalid-action-index',
    });

    masterSocket.send('live.start', { handId, actionIndex: 0 });
    await masterSocket.next('live.started');
    masterSocket.send('live.start', { handId, actionIndex: 0 });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'live.start',
      reason: 'already-live',
    });
  });
});
