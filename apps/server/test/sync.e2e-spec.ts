import { performance } from 'node:perf_hooks';
import request from 'supertest';
import {
  AWAY_AFTER_MS,
  UNSTABLE_AFTER_MS,
} from '../src/rooms/room-presence.js';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface ParticipantPresence {
  identityId: string;
  presence: 'connected' | 'unstable' | 'away';
  latencyMs: number | null;
  inSync: boolean;
}

interface Snapshot {
  you: string;
  participants: { identityId: string; role: string }[];
  queue: { handId: string }[];
  playback: { handId: string; actionIndex: number } | null;
  revision: number;
  presence: ParticipantPresence[];
}

/** How long a Playback change may take to reach a Guest on a local run. */
const REACHES_GUESTS_WITHIN_MS = 300;

describe('Sync robustness and presence (e2e)', () => {
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

  async function join(token: string, code: string, displayName: string) {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    const snapshot = await socket.next<Snapshot>('room.snapshot');
    return { socket, snapshot };
  }

  /** A Room with the Master and one Guest in it, and one Hand in its Queue. */
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
      handId: entries[0].handId,
    };
  }

  it('gives every change to the Room the next revision, in an unbroken run', async () => {
    const { code, guest, masterSocket, handId } = await roomWithAHand();
    // A second tab of the Guest's, joined last and left unread, so every
    // change the Room makes from here is still sitting in it, in order.
    const { socket: watcher, snapshot } = await join(
      guest.token,
      code,
      'Marta',
    );

    masterSocket.send('playback.load', { handId });
    masterSocket.send('playback.goTo', { actionIndex: 3 });
    await watcher.until<{ actionIndex: number }>(
      'playback.changed',
      (playback) => playback.actionIndex === 3,
    );

    const revisions = watcher
      .messages()
      .map((message) => message.revision)
      .filter((revision): revision is number => revision !== undefined);
    expect(revisions).toEqual([snapshot.revision + 1, snapshot.revision + 2]);
  });

  it('carries no revision on the presence of a Room, which only ever replaces itself', async () => {
    const { masterSocket, guestSocket, guest } = await roomWithAHand();

    masterSocket.send('room.heartbeat', {
      sentAt: 1,
      revision: 0,
      latencyMs: 40,
    });
    const told = await guestSocket.nextMessage<{
      participants: ParticipantPresence[];
    }>('room.presence');

    expect(told.revision).toBeUndefined();
    expect(told.data.participants).toContainEqual(
      expect.objectContaining({ identityId: guest.id }),
    );
  });

  it('hands back the Room as it stands, at its current revision, on room.resync', async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    const change = await guestSocket.nextMessage('playback.changed');

    guestSocket.send('room.resync');
    const snapshot = await guestSocket.next<Snapshot>('room.snapshot');

    expect(snapshot.revision).toBe(change.revision);
    expect(snapshot.playback).toEqual({ handId, actionIndex: 0 });
    expect(snapshot.queue.map((entry) => entry.handId)).toEqual([handId]);
  });

  it('refuses a resync from a socket that is in no Room', async () => {
    const stranger = await issueIdentity();
    const socket = await RoomClient.connect(running.wsUrl, stranger.token);
    clients.push(socket);

    socket.send('room.resync');

    expect(await socket.next('rejected')).toEqual({
      command: 'room.resync',
      reason: 'not-in-room',
    });
  });

  it('echoes a heartbeat back so the client can time its own round trip', async () => {
    const { masterSocket } = await roomWithAHand();

    masterSocket.send('room.heartbeat', {
      sentAt: 1_700_000_000_123,
      revision: 2,
      latencyMs: null,
    });

    expect(await masterSocket.next('room.heartbeatAck')).toEqual({
      sentAt: 1_700_000_000_123,
    });
  });

  it('tells the Room a Participant is unstable, then away, as their heartbeats stop', async () => {
    const { masterSocket, guestSocket, guest } = await roomWithAHand();

    await running.clock.advance(UNSTABLE_AFTER_MS);
    masterSocket.send('room.heartbeat', {
      sentAt: 1,
      revision: 0,
      latencyMs: 8,
    });
    expect(await presenceOf(masterSocket, guest.id)).toBe('unstable');

    await running.clock.advance(AWAY_AFTER_MS - UNSTABLE_AFTER_MS);
    masterSocket.send('room.heartbeat', {
      sentAt: 2,
      revision: 0,
      latencyMs: 8,
    });
    expect(await presenceOf(masterSocket, guest.id)).toBe('away');

    // The Guest is still in the Room: a silence is not a departure.
    expect(guestSocket.all('room.closed')).toEqual([]);
  });

  it('shows the Master which Guests have applied the Room’s current revision', async () => {
    const { masterSocket, guestSocket, guest, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    const change = await guestSocket.nextMessage('playback.changed');
    const behind = change.revision! - 1;

    guestSocket.send('room.heartbeat', {
      sentAt: 1,
      revision: behind,
      latencyMs: 42,
    });
    expect(
      await presenceReport(masterSocket, guest.id, 'latencyMs', 42),
    ).toMatchObject({
      inSync: false,
    });

    guestSocket.send('room.heartbeat', {
      sentAt: 2,
      revision: change.revision,
      latencyMs: 40,
    });
    expect(
      await presenceReport(masterSocket, guest.id, 'latencyMs', 40),
    ).toMatchObject({
      presence: 'connected',
      inSync: true,
    });
  });

  /**
   * The Participant's presence in the first report that carries `key`, so a
   * test never reads a report the Room sent before the change it is after.
   */
  async function presenceReport<K extends keyof ParticipantPresence>(
    socket: RoomClient,
    identityId: string,
    key: K,
    value: ParticipantPresence[K],
  ): Promise<ParticipantPresence> {
    const report = await socket.next<{ participants: ParticipantPresence[] }>(
      'room.presence',
      (data) =>
        data.participants.some(
          (one) => one.identityId === identityId && one[key] === value,
        ),
    );
    return report.participants.find((one) => one.identityId === identityId)!;
  }

  /** Waits for the Room to report this Participant under a new presence. */
  async function presenceOf(
    socket: RoomClient,
    identityId: string,
  ): Promise<ParticipantPresence['presence']> {
    const report = await socket.next<{ participants: ParticipantPresence[] }>(
      'room.presence',
      (data) =>
        data.participants.some(
          (one) =>
            one.identityId === identityId && one.presence !== 'connected',
        ),
    );
    return report.participants.find((one) => one.identityId === identityId)!
      .presence;
  }

  it(`reaches a Guest with a Playback change in under ${REACHES_GUESTS_WITHIN_MS} ms`, async () => {
    const { masterSocket, guestSocket, handId } = await roomWithAHand();
    masterSocket.send('playback.load', { handId });
    await guestSocket.next('playback.changed');

    const sentAt = performance.now();
    masterSocket.send('playback.goTo', { actionIndex: 5 });
    await guestSocket.next('playback.changed');

    expect(performance.now() - sentAt).toBeLessThan(REACHES_GUESTS_WITHIN_MS);
  });
});
