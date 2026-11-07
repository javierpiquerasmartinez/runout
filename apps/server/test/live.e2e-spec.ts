import pg from 'pg';
import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { TestClock } from './support/test-clock.js';

interface Playback {
  handId: string;
  actionIndex: number;
  hideOpponentNames: boolean;
}

interface Snapshot {
  state: 'free-review' | 'live';
  playback: Playback | null;
  participants: { identityId: string; role: 'master' | 'guest' }[];
  /** The Hand this Participant was last on in Free Review, while it is in the Queue. */
  yourHand: string | null;
  queue: { id: string; handId: string }[];
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

  describe('the Hand each Participant was on', () => {
    /** A Room in Free Review with two Hands in its Queue. */
    async function roomWithTwoHands() {
      const room = await roomWithAHand();
      await request(running.httpServer)
        .post(`/api/rooms/${room.code}/hands`)
        .set('Authorization', `Bearer ${room.master.token}`)
        .send({ text: freshHandHistory('pokerstars-session.txt') })
        .expect(201);
      const { entries } = await room.masterSocket.next<{
        entries: { id: string; handId: string }[];
      }>('queue.entriesAdded');
      return { ...room, second: entries[0] };
    }

    it('knows none for someone who has never opened one', async () => {
      const { snapshot } = await roomWithAHand();
      expect(snapshot.yourHand).toBeNull();
    });

    it('lands someone back on the Hand they opened, from any browser', async () => {
      const { code, guest, guestSocket, second } = await roomWithTwoHands();

      guestSocket.send('review.open', { handId: second.handId });
      await guestSocket.next('review.opened');

      const elsewhere = await join(guest.token, code, 'Marta');
      expect(elsewhere.snapshot.yourHand).toBe(second.handId);
    });

    it('keeps each Participant’s Hand their own', async () => {
      const { code, master, guestSocket, second } = await roomWithTwoHands();

      guestSocket.send('review.open', { handId: second.handId });
      await guestSocket.next('review.opened');

      const { snapshot } = await join(master.token, code, 'Javier');
      expect(snapshot.yourHand).toBeNull();
    });

    it('lands everyone on the Hand Live ended on', async () => {
      const { code, guest, masterSocket, guestSocket, handId, second } =
        await roomWithTwoHands();
      guestSocket.send('review.open', { handId });
      await guestSocket.next('review.opened');

      masterSocket.send('live.start', {
        handId: second.handId,
        actionIndex: 0,
      });
      await guestSocket.next('live.started');
      masterSocket.send('live.end');
      await guestSocket.next('live.ended');

      const { snapshot } = await join(guest.token, code, 'Marta');
      expect(snapshot.yourHand).toBe(second.handId);
    });

    it('forgets a Hand whose Queue Entry was removed', async () => {
      const { code, guest, masterSocket, guestSocket, second } =
        await roomWithTwoHands();
      guestSocket.send('review.open', { handId: second.handId });
      await guestSocket.next('review.opened');

      masterSocket.send('queue.remove', { id: second.id });
      await guestSocket.next('queue.entryRemoved');

      const { snapshot } = await join(guest.token, code, 'Marta');
      expect(snapshot.yourHand).toBeNull();
    });

    it('keeps a removed Hand forgotten even when its removal is undone', async () => {
      const { code, guest, masterSocket, guestSocket, second } =
        await roomWithTwoHands();
      guestSocket.send('review.open', { handId: second.handId });
      await guestSocket.next('review.opened');

      masterSocket.send('queue.remove', { id: second.id });
      await guestSocket.next('queue.entryRemoved');
      masterSocket.send('queue.undoRemoval', { id: second.id });
      await guestSocket.next('queue.entryRestored');

      const { snapshot } = await join(guest.token, code, 'Marta');
      expect(snapshot.yourHand).toBeNull();
    });

    it('refuses a Hand that is not in the Queue', async () => {
      const { guestSocket } = await roomWithAHand();

      guestSocket.send('review.open', {
        handId: '00000000-0000-4000-8000-000000000000',
      });
      expect(await guestSocket.next('rejected')).toEqual({
        command: 'review.open',
        reason: 'hand-not-in-queue',
      });
    });
  });

  describe('the Master away', () => {
    /** Advances past the Master's grace period, as master.e2e-spec reads it. */
    const GRACE_MS = 120_000;
    const LIVE_ENDS_MS = 30 * 60_000;

    /** Waits for the server to have seen a connection go. */
    async function untilGone(socket: RoomClient, watcher?: RoomClient) {
      await socket.close();
      if (watcher) await watcher.next('room.participantLeft');
    }

    it('keeps the role while away in Free Review, however long a Guest stays', async () => {
      const { code, master, masterSocket, guestSocket } = await roomWithAHand();

      await untilGone(masterSocket, guestSocket);
      await running.clock.advance(GRACE_MS * 10);

      const back = await join(master.token, code, 'Javier');
      expect(back.snapshot.participants).toContainEqual(
        expect.objectContaining({ identityId: master.id, role: 'master' }),
      );
      expect(guestSocket.all('room.masterChanged')).toEqual([]);
    });

    it('passes the role on while Live, as before', async () => {
      const { guest, masterSocket, guestSocket } = await roomWithAHand();
      masterSocket.send('live.start', {});
      await guestSocket.next('live.started');

      await untilGone(masterSocket, guestSocket);
      await running.clock.advance(GRACE_MS);

      expect(await guestSocket.next('room.masterChanged')).toMatchObject({
        masterId: guest.id,
        reason: 'failover',
      });
    });

    it('ends Live once the Room has had no Master for 30 minutes', async () => {
      const { code, guest, masterSocket, guestSocket } = await roomWithAHand();
      masterSocket.send('live.start', {});
      await guestSocket.next('live.started');

      await untilGone(guestSocket, masterSocket);
      await untilGone(masterSocket);
      await running.clock.advance(LIVE_ENDS_MS);

      const { snapshot } = await join(guest.token, code, 'Marta');
      expect(snapshot.state).toBe('free-review');
    });

    it('stays Live when the Master comes back in time', async () => {
      const { code, master, guest, masterSocket, guestSocket } =
        await roomWithAHand();
      masterSocket.send('live.start', {});
      await guestSocket.next('live.started');

      await untilGone(guestSocket, masterSocket);
      await untilGone(masterSocket);
      await running.clock.advance(LIVE_ENDS_MS - 60_000);
      await join(master.token, code, 'Javier');
      await running.clock.advance(LIVE_ENDS_MS);

      const { snapshot } = await join(guest.token, code, 'Marta');
      expect(snapshot.state).toBe('live');
    });

    /**
     * Runs `test` on a database of its own: an app on the shared one leaves
     * the Live Rooms it finds there to their own app (see startApp).
     */
    async function onItsOwnDatabase(
      test: (
        restart: (at: string, whileDown?: () => Promise<void>) => Promise<void>,
      ) => Promise<void>,
    ) {
      await running.close();
      const database = await freshDatabase();
      try {
        running = await startApp({ databaseUrl: database.url });
        await test(async (at, whileDown) => {
          // Shutting down closes every connection still open.
          clients.splice(0);
          await running.close();
          await whileDown?.();
          running = await startApp({
            databaseUrl: database.url,
            clock: new TestClock(new Date(at)),
          });
        });
      } finally {
        await Promise.all(clients.splice(0).map((client) => client.close()));
        await running.close();
        running = { ...running, close: () => Promise.resolve() };
        await database.drop();
      }
    }

    /** Reads the Room's row as a restart would find it. */
    async function roomRow(code: string) {
      const db = new pg.Client(running.databaseUrl);
      await db.connect();
      try {
        const { rows } = await db.query<{
          state: string;
          master_away_since: Date | null;
        }>('select state, master_away_since from rooms where code = $1', [
          code,
        ]);
        return rows[0];
      } finally {
        await db.end();
      }
    }

    /** As a crash leaves the Room: its Master was connected, so no absence is recorded. */
    async function crashedWithMasterConnected(code: string) {
      const db = new pg.Client(running.databaseUrl);
      await db.connect();
      try {
        await db.query(
          'update rooms set master_away_since = null where code = $1',
          [code],
        );
      } finally {
        await db.end();
      }
    }

    /** A Live Room whose Guest has left, its Master still connected. */
    async function liveWithOnlyTheMaster() {
      const room = await roomWithAHand();
      room.masterSocket.send('live.start', {});
      await room.guestSocket.next('live.started');
      await untilGone(room.guestSocket, room.masterSocket);
      return room;
    }

    it('still ends Live on time after the server restarts', async () => {
      await onItsOwnDatabase(async (restart) => {
        const { code, guest, masterSocket } = await liveWithOnlyTheMaster();
        await untilGone(masterSocket);
        await expect
          .poll(async () => {
            const res = await request(running.httpServer)
              .get('/api/rooms')
              .set('Authorization', `Bearer ${guest.token}`);
            return (res.body as { code: string; connected: number }[]).find(
              (open) => open.code === code,
            )?.connected;
          })
          .toBe(0);
        await running.clock.advance(LIVE_ENDS_MS / 2);
        await restart('2026-01-01T00:15:00Z');
        await running.clock.advance(LIVE_ENDS_MS / 2);

        const { snapshot } = await join(guest.token, code, 'Marta');
        expect(snapshot.state).toBe('free-review');
      });
    });

    it('counts from the shutdown when the server goes down with the Master connected', async () => {
      await onItsOwnDatabase(async (restart) => {
        const { code } = await liveWithOnlyTheMaster();
        await running.clock.advance(20 * 60_000);
        await restart('2026-01-01T00:30:00Z');

        // Down at 00:20 for ten minutes, then twenty more: 30 since it went down.
        await running.clock.advance(20 * 60_000 - 1);
        expect((await roomRow(code)).state).toBe('live');
        await running.clock.advance(1);
        expect((await roomRow(code)).state).toBe('free-review');
      });
    });

    it('ends Live 30 minutes after a restart that followed a crash with the Master connected', async () => {
      await onItsOwnDatabase(async (restart) => {
        const { code, guest } = await liveWithOnlyTheMaster();
        await restart('2026-01-01T02:00:00Z', () =>
          crashedWithMasterConnected(code),
        );

        // The period counts from the restart, and a second one carries it on.
        expect((await roomRow(code)).master_away_since).toEqual(
          new Date('2026-01-01T02:00:00Z'),
        );
        await running.clock.advance(LIVE_ENDS_MS - 1);
        expect((await roomRow(code)).state).toBe('live');
        await running.clock.advance(1);

        const { snapshot } = await join(guest.token, code, 'Marta');
        expect(snapshot.state).toBe('free-review');
      });
    });

    it('passes the role on after such a restart, once the grace period runs out', async () => {
      await onItsOwnDatabase(async (restart) => {
        const { code, guest } = await liveWithOnlyTheMaster();
        await restart('2026-01-01T02:00:00Z', () =>
          crashedWithMasterConnected(code),
        );
        await running.clock.advance(GRACE_MS);

        const { snapshot } = await join(guest.token, code, 'Marta');
        expect(snapshot.state).toBe('live');
        expect(snapshot.participants).toContainEqual(
          expect.objectContaining({ identityId: guest.id, role: 'master' }),
        );
        // Someone holds the role again: Live goes on.
        await running.clock.advance(LIVE_ENDS_MS);
        expect((await roomRow(code)).state).toBe('live');
      });
    });

    it('stays Live after such a restart when the Master comes back in time', async () => {
      await onItsOwnDatabase(async (restart) => {
        const { code, master } = await liveWithOnlyTheMaster();
        await restart('2026-01-01T02:00:00Z', () =>
          crashedWithMasterConnected(code),
        );
        await running.clock.advance(60_000);

        const { snapshot } = await join(master.token, code, 'Javier');
        expect(snapshot.participants).toContainEqual(
          expect.objectContaining({ identityId: master.id, role: 'master' }),
        );
        await running.clock.advance(LIVE_ENDS_MS);
        expect(await roomRow(code)).toEqual({
          state: 'live',
          master_away_since: null,
        });
      });
    });
  });
});
