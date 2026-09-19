import { strToU8, zipSync } from 'fflate';
import request from 'supertest';
import { fixture, freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Preview {
  id: string;
  format: string | null;
  tried: string[];
  hands: {
    hero: string;
    author: { identityId: string; displayName: string };
    heroMatched: boolean;
    playedAt: string;
    stake: { bigBlind: number; currency: string };
    board: string[];
    summary: {
      positions: string[];
      finalPot: number;
      finalStreet: string;
      showdown: boolean;
    };
  }[];
  discarded: { text: string; reason: string }[];
}

interface QueueEntry {
  position: number;
  author: { identityId: string };
  playedAt: string;
}

const MB = 1024 * 1024;

describe('Importing Hand History files through a preview (e2e)', () => {
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
  ): Promise<RoomClient> {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    await socket.next('room.snapshot');
    return socket;
  }

  function upload(
    token: string,
    code: string,
    name: string,
    content: string | Uint8Array,
    format?: string,
  ) {
    const req = request(running.httpServer)
      .post(`/api/rooms/${code}/imports/previews`)
      .set('Authorization', `Bearer ${token}`)
      .attach(
        'file',
        typeof content === 'string'
          ? Buffer.from(content)
          : Buffer.from(content),
        name,
      );
    return format ? req.field('format', format) : req;
  }

  function confirm(token: string, code: string, previews: string[]) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .send({ previews });
  }

  it('previews a multi-file batch with a bad Hand in it, then broadcasts only the good Hands on confirm', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    const masterSocket = await join(master.token, code, 'Javier');
    const guestSocket = await join(guest.token, code, 'Marta');
    const [first, second] = freshHandHistory('pokerstars-session.txt').split(
      /\n\n\n/,
    );
    const withBadHand = [first, 'not a hand history', second].join('\n\n');

    const sessionPreview = await upload(
      guest.token,
      code,
      'session.txt',
      withBadHand,
    ).expect(201);
    const zipped = await upload(
      guest.token,
      code,
      'showdown.zip',
      zipSync({
        'hh.txt': strToU8(freshHandHistory('pokerstars-showdown.txt')),
      }),
    ).expect(201);

    expect(sessionPreview.body).toEqual({
      id: expect.any(String),
      format: 'pokerstars',
      tried: ['pokerstars', 'ggpoker', 'winamax'],
      hands: [
        expect.objectContaining({ board: [] }),
        expect.objectContaining({ board: expect.any(Array) }),
      ],
      discarded: [
        { text: 'not a hand history', reason: 'unrecognised-format' },
      ],
    });
    expect((zipped.body as Preview).hands).toEqual([
      {
        hero: 'iMapleAA',
        author: { identityId: guest.id, displayName: 'Marta' },
        heroMatched: false,
        playedAt: '2026-09-18T12:34:30.000Z',
        stake: {
          limit: 'no-limit',
          smallBlind: 5,
          bigBlind: 10,
          currency: 'EUR',
        },
        board: ['2c', '10h', '4c', 'Qs', '8c'],
        summary: {
          positions: ['BTN', 'BB'],
          finalPot: 105,
          finalStreet: 'river',
          showdown: true,
        },
      },
    ]);
    // Previewing puts nothing in the Queue.
    expect(masterSocket.all('queue.entriesAdded')).toEqual([]);

    const res = await confirm(guest.token, code, [
      sessionPreview.body.id,
      zipped.body.id,
    ]).expect(201);

    expect(res.body).toEqual({ imported: 3 });
    for (const socket of [masterSocket, guestSocket]) {
      const { entries } = await socket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3]);
      expect(entries.map((entry) => entry.author.identityId)).toEqual([
        guest.id,
        guest.id,
        guest.id,
      ]);
      expect(entries[2].playedAt).toBe('2026-09-18T12:34:30.000Z');
    }
  });

  it('imports only the previews that are confirmed, so a file removed before confirming stays out', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    const socket = await join(master.token, code, 'Javier');
    const kept = await upload(
      master.token,
      code,
      'kept.txt',
      freshHandHistory('pokerstars-showdown.txt'),
    );
    await upload(
      master.token,
      code,
      'removed.txt',
      freshHandHistory('pokerstars-session.txt'),
    );

    await confirm(master.token, code, [kept.body.id]).expect(201);

    const { entries } = await socket.next<{ entries: QueueEntry[] }>(
      'queue.entriesAdded',
    );
    expect(entries).toHaveLength(1);
  });

  it('confirms a preview only once', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');
    const preview = await upload(
      master.token,
      code,
      'hh.txt',
      freshHandHistory('pokerstars-showdown.txt'),
    );
    await confirm(master.token, code, [preview.body.id]).expect(201);

    const again = await confirm(master.token, code, [preview.body.id]).expect(
      404,
    );

    expect(again.body).toEqual({ reason: 'preview-not-found' });
  });

  it('refuses to confirm someone else’s preview', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');
    await join(guest.token, code, 'Marta');
    const preview = await upload(
      guest.token,
      code,
      'hh.txt',
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const res = await confirm(master.token, code, [preview.body.id]).expect(
      404,
    );

    expect(res.body).toEqual({ reason: 'preview-not-found' });
  });

  it('forgets a preview that was never confirmed after an hour', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');
    const preview = await upload(
      master.token,
      code,
      'hh.txt',
      freshHandHistory('pokerstars-showdown.txt'),
    );

    await running.clock.advance(60 * 60 * 1000 + 1);

    await confirm(master.token, code, [preview.body.id]).expect(404);
  });

  it('says which formats it tried when it recognises nothing, and reads the file again in a format picked by hand', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');
    const forum = fixture('pokertracker-forum.txt');

    const detected = await upload(master.token, code, 'forum.txt', forum);
    const picked = await upload(
      master.token,
      code,
      'forum.txt',
      forum,
      'pokerstars',
    ).expect(201);

    expect(detected.body).toMatchObject({
      format: null,
      tried: ['pokerstars', 'ggpoker', 'winamax'],
      hands: [],
      discarded: [{ reason: 'unrecognised-format' }],
    });
    expect(picked.body).toMatchObject({
      format: 'pokerstars',
      tried: ['pokerstars'],
    });
  });

  it('previews pasted text the same way', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');

    const res = await request(running.httpServer)
      .post(`/api/rooms/${code}/imports/previews`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);

    expect((res.body as Preview).hands).toHaveLength(4);
  });

  it('refuses a file over 20 MB', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');

    const res = await upload(
      master.token,
      code,
      'huge.txt',
      'x'.repeat(20 * MB + 1),
    ).expect(413);

    expect(res.body).toEqual({ reason: 'file-too-large' });
  });

  it('refuses a zip it cannot open', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');

    const res = await upload(
      master.token,
      code,
      'broken.zip',
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
    ).expect(400);

    expect(res.body).toEqual({ reason: 'unreadable-file' });
  });

  it('refuses a format it does not know', async () => {
    const master = await issueIdentity();
    const code = await createRoom(master.token);
    await join(master.token, code, 'Javier');

    const res = await upload(
      master.token,
      code,
      'hh.txt',
      freshHandHistory('pokerstars-showdown.txt'),
      'ipoker',
    ).expect(400);

    expect(res.body).toEqual({ reason: 'invalid-format' });
  });

  it('refuses a preview from someone who is not a Participant of the Room', async () => {
    const master = await issueIdentity();
    const stranger = await issueIdentity();
    const code = await createRoom(master.token);

    const res = await upload(
      stranger.token,
      code,
      'hh.txt',
      freshHandHistory('pokerstars-showdown.txt'),
    ).expect(403);

    expect(res.body).toEqual({ reason: 'not-in-room' });
  });
});
