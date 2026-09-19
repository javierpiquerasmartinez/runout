import { readFileSync } from 'node:fs';
import request from 'supertest';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Playback {
  handId: string;
  actionIndex: number;
}

function fixture(name: string): string {
  return readFileSync(
    new URL(`../src/hands/import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

describe('Playback (e2e)', () => {
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

  async function join(
    token: string,
    code: string,
    displayName: string,
  ): Promise<{ socket: RoomClient; playback: Playback | null }> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    const snapshot = await socket.next<{ playback: Playback | null }>(
      'room.snapshot',
    );
    return { socket, playback: snapshot.playback };
  }

  /**
   * A Room with the Master and one Guest in it and the showdown Hand in its
   * Queue. Returns the Hand's id.
   */
  async function roomWithAHand() {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const created = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const code = created.body.code as string;
    const { socket: masterSocket } = await join(master.token, code, 'Javier');
    const { socket: guestSocket } = await join(guest.token, code, 'Marta');
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text: fixture('pokerstars-showdown.txt') })
      .expect(201);
    const { entries } = await masterSocket.next<{
      entries: { handId: string }[];
    }>('queue.entriesAdded');
    return {
      code,
      master,
      guest,
      masterSocket,
      guestSocket,
      handId: entries[0].handId,
    };
  }

  it('takes every table to the Initial State when the Master loads a Hand', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();

    masterSocket.send('playback.load', { handId });

    const expected = { handId, actionIndex: 0 };
    expect(await masterSocket.next('playback.changed')).toEqual(expected);
    expect(await guestSocket.next('playback.changed')).toEqual(expected);
  });

  it('sends every Participant the Master’s "go to Action N"', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    await guestSocket.next('playback.changed');

    masterSocket.send('playback.goTo', { actionIndex: 3 });
    expect(await guestSocket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 3,
    });
    masterSocket.send('playback.goTo', { actionIndex: 2 });
    expect(await guestSocket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 2,
    });
  });

  it('rejects a Guest’s step or load with a reason, and moves nobody', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    await guestSocket.next('playback.changed');
    await masterSocket.next('playback.changed');

    guestSocket.send('playback.goTo', { actionIndex: 1 });
    guestSocket.send('playback.load', { handId });

    for (const command of ['playback.goTo', 'playback.load']) {
      expect(
        await guestSocket.next(
          'rejected',
          (data: { command: string }) => data.command === command,
        ),
      ).toEqual({ command, reason: 'not-master' });
    }
    // The Master's next step is the next Playback anyone sees.
    masterSocket.send('playback.goTo', { actionIndex: 5 });
    expect(await guestSocket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 5,
    });
    expect(guestSocket.all('playback.changed')).toEqual([]);
  });

  it('rejects an Action outside the Hand, a Hand not in the Queue, or stepping with nothing loaded', async () => {
    const { masterSocket, handId } = await roomWithAHand();

    masterSocket.send('playback.goTo', { actionIndex: 1 });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.goTo',
      reason: 'no-hand-loaded',
    });

    masterSocket.send('playback.load', {
      handId: '00000000-0000-4000-8000-000000000000',
    });
    expect(await masterSocket.next('rejected')).toEqual({
      command: 'playback.load',
      reason: 'hand-not-in-queue',
    });

    masterSocket.send('playback.load', { handId });
    await masterSocket.next('playback.changed');
    // The showdown Hand has 15 steps: the Initial State, 10 Actions, the
    // flop, turn and river dealt, and the end. 0 to 14 are valid.
    masterSocket.send('playback.goTo', { actionIndex: 14 });
    expect(await masterSocket.next('playback.changed')).toEqual({
      handId,
      actionIndex: 14,
    });
    for (const actionIndex of [15, -1, 1.5, 'x']) {
      masterSocket.send('playback.goTo', { actionIndex });
      expect(await masterSocket.next('rejected')).toEqual({
        command: 'playback.goTo',
        reason: 'invalid-action-index',
      });
    }
  });

  it('lands a Participant who joins mid-Hand on the loaded Hand at its current Action', async () => {
    const { code, masterSocket, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    masterSocket.send('playback.goTo', { actionIndex: 4 });
    await masterSocket.next(
      'playback.changed',
      (p: Playback) => p.actionIndex === 4,
    );
    const late = await issueIdentity();

    const { playback } = await join(late.token, code, 'Alberto');

    expect(playback).toEqual({ handId, actionIndex: 4 });
  });

  it('gives no Playback in the snapshot while nothing is loaded', async () => {
    const { code } = await roomWithAHand();
    const late = await issueIdentity();

    const { playback } = await join(late.token, code, 'Alberto');

    expect(playback).toBeNull();
  });

  it('serves the Hand with its Timeline by id to a Participant, and to nobody else', async () => {
    const { guest, handId } = await roomWithAHand();
    const stranger = await issueIdentity();

    const res = await request(running.httpServer)
      .get(`/api/hands/${handId}`)
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: handId,
      tableSize: 6,
      stake: {
        limit: 'no-limit',
        smallBlind: 5,
        bigBlind: 10,
        currency: 'EUR',
      },
      timeline: {
        buttonSeat: 5,
        hero: { screenName: 'iMapleAA', cards: ['Js', '8s'] },
        showdown: true,
      },
    });
    expect(res.body.timeline.states).toHaveLength(15);
    expect(res.headers['cache-control']).toMatch(/private/);

    const refused = await request(running.httpServer)
      .get(`/api/hands/${handId}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    expect(refused.body).toEqual({ reason: 'hand-not-found' });
    await request(running.httpServer)
      .get('/api/hands/not-a-uuid')
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(404);
  });
});
