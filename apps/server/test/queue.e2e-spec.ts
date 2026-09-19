import { readFileSync } from 'node:fs';
import request from 'supertest';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface QueueEntry {
  id: string;
  handId: string;
  position: number;
  author: { identityId: string; displayName: string };
  playedAt: string;
  stake: {
    limit: string;
    smallBlind: number;
    bigBlind: number;
    currency: string;
  };
  summary: {
    positions: string[];
    finalPot: number;
    finalStreet: string;
    showdown: boolean;
  };
}

function fixture(name: string): string {
  return readFileSync(
    new URL(`../src/hands/import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

describe('Pasting Hands into the Queue (e2e)', () => {
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

  function paste(token: string | undefined, code: string, text: string) {
    const req = request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .send({ text });
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  it('broadcasts a pasted Hand to every Participant, Importer included, with its summary', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    const { socket: masterSocket } = await join(master.token, code, 'Javier');
    const { socket: guestSocket } = await join(guest.token, code, 'Marta');

    const res = await paste(
      guest.token,
      code,
      fixture('pokerstars-showdown.txt'),
    ).expect(201);

    expect(res.body).toEqual({ imported: 1, discarded: [] });
    const expected: QueueEntry[] = [
      {
        id: expect.any(String),
        handId: expect.any(String),
        position: 1,
        // For now the Importer is the Author.
        author: { identityId: guest.id, displayName: 'Marta' },
        playedAt: '2026-09-18T12:34:30.000Z',
        stake: {
          limit: 'no-limit',
          smallBlind: 5,
          bigBlind: 10,
          currency: 'EUR',
        },
        summary: {
          positions: ['BTN', 'BB'],
          finalPot: 105,
          finalStreet: 'river',
          showdown: true,
        },
      },
    ];
    // Within the 2 s the issue allows (RoomClient.next's default timeout).
    expect(await masterSocket.next('queue.entriesAdded')).toEqual({
      entries: expected,
    });
    expect(await guestSocket.next('queue.entriesAdded')).toEqual({
      entries: expected,
    });
  });

  it('imports every Hand of one paste and appends later pastes at the end of the Queue', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    const { socket } = await join(master.token, code, 'Javier');

    await paste(master.token, code, fixture('pokerstars-session.txt')).expect(
      201,
    );
    const first = await socket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );
    await paste(master.token, code, fixture('pokerstars-showdown.txt')).expect(
      201,
    );
    const second = await socket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );

    expect(first.entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(second.entries.map((entry) => entry.position)).toEqual([5]);
  });

  it('gives a Participant who joins later the Queue in their snapshot', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    const { socket } = await join(master.token, code, 'Javier');
    await paste(master.token, code, fixture('pokerstars-session.txt'));
    const { entries } = await socket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );

    const { queue } = await join(guest.token, code, 'Marta');

    expect(queue).toEqual(entries);
    expect(queue[0].author).toEqual({
      identityId: master.id,
      displayName: 'Javier',
    });
  });

  it('reports what it discarded, and broadcasts nothing when no Hand was read', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    const { socket } = await join(master.token, code, 'Javier');
    const forum = fixture('pokertracker-forum.txt');

    const res = await paste(master.token, code, forum).expect(201);

    expect(res.body).toEqual({
      imported: 0,
      discarded: [{ text: forum.trim(), reason: 'unrecognised-format' }],
    });
    await paste(master.token, code, fixture('pokerstars-showdown.txt'));
    const { entries } = await socket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );
    expect(entries.map((entry) => entry.position)).toEqual([1]);
    expect(socket.all('queue.entriesAdded')).toEqual([]);
  });

  it('takes a long session pasted at once, well past the default body size', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');
    const session = Array(100)
      .fill(fixture('pokerstars-session.txt'))
      .join('\n\n');

    const res = await paste(master.token, code, session).expect(201);

    expect(res.body.imported).toBe(400);
  });

  it('refuses a paste from someone who is not a Participant of the Room', async () => {
    const master = await issueIdentity();
    const stranger = await issueIdentity();
    const code = await createRoom(master.token);

    const res = await paste(
      stranger.token,
      code,
      fixture('pokerstars-showdown.txt'),
    ).expect(403);

    expect(res.body).toEqual({ reason: 'not-in-room' });
  });

  it('refuses a paste without an identity', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);

    const res = await paste(
      undefined,
      code,
      fixture('pokerstars-showdown.txt'),
    ).expect(401);

    expect(res.body).toEqual({ reason: 'unauthenticated' });
  });
});
