import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

describe('Copying a Hand (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  /** Imports `text` into `token`'s Library and returns its first Hand's id. */
  async function importText(token: string, text: string): Promise<string> {
    const preview = await request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${token}`)
      .send({ text })
      .expect(201);
    await request(running.httpServer)
      .post('/api/library/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ previews: [preview.body.id as string] })
      .expect(201);
    const page = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (page.body.hands as { id: string }[])[0].id;
  }

  /** The ids of every Hand in `token`'s Library. */
  async function libraryHands(token: string): Promise<{ id: string }[]> {
    const page = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return page.body.hands as { id: string }[];
  }

  /** Opens a Room with `token` as its Master, joined, and returns its code. */
  async function openRoom(token: string): Promise<{
    code: string;
    socket: RoomClient;
  }> {
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const code = room.body.code as string;
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName: 'Javier' });
    await socket.next('room.snapshot');
    return { code, socket };
  }

  /** The Hands of a Hand History text, each as its own block. */
  function blocksOf(text: string): string[] {
    return text
      .split(/\n[ \t\r]*\n/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);
  }

  function copy(token: string, handId: string, query: Record<string, string>) {
    return request(running.httpServer)
      .get(`/api/hands/${handId}/copy`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  const showdownInSpanish = [
    'PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 18/09/2026',
    'Hero BTN 100bb · J♠ 8♠',
    '',
    'Preflop: CO fold, Hero raise 3bb, SB fold, BB call',
    'Flop (6,5bb) 2♣ T♥ 4♣: BB check, Hero check',
    'Turn (6,5bb) Q♠: BB bet 2bb, Hero call',
    'River (10,5bb) 8♣: BB check, Hero check',
    'Showdown: BB muestra A♠ 7♦ · Hero gana 9,9bb (rake 0,6bb)',
    'Resultado Hero: +4,9bb',
  ].join('\n');

  it('copies a Library Hand as its Hand Summary, in plain text that is never cached', async () => {
    const owner = await newAccount(running.httpServer);
    const handId = await importText(
      owner.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const res = await copy(owner.token, handId, {
      as: 'summary',
      language: 'es',
      timeZone: 'Europe/Madrid',
    }).expect(200);

    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.text).toBe(showdownInSpanish);
  });

  it('writes the Hand Summary in English, with the date in the time zone asked for', async () => {
    const owner = await newAccount(running.httpServer);
    const handId = await importText(
      owner.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const english = await copy(owner.token, handId, {
      as: 'summary',
      language: 'en',
      timeZone: 'Europe/Madrid',
    }).expect(200);
    // Played at 12:34 UTC: already the next day in Kiritimati.
    const kiritimati = await copy(owner.token, handId, {
      as: 'summary',
      language: 'en',
      timeZone: 'Pacific/Kiritimati',
    }).expect(200);

    expect(english.text.split('\n')).toEqual([
      'PokerStars · NL10 (€0.05/€0.10) · 6-max · 09/18/2026',
      'Hero BTN 100bb · J♠ 8♠',
      '',
      'Preflop: CO fold, Hero raise 3bb, SB fold, BB call',
      'Flop (6.5bb) 2♣ T♥ 4♣: BB check, Hero check',
      'Turn (6.5bb) Q♠: BB bet 2bb, Hero call',
      'River (10.5bb) 8♣: BB check, Hero check',
      'Showdown: BB shows A♠ 7♦ · Hero wins 9.9bb (rake 0.6bb)',
      'Hero result: +4.9bb',
    ]);
    expect(kiritimati.text.split('\n')[0]).toBe(
      'PokerStars · NL10 (€0.05/€0.10) · 6-max · 09/19/2026',
    );
  });

  it('writes in Spanish and in UTC when neither is asked for', async () => {
    const owner = await newAccount(running.httpServer);
    const handId = await importText(
      owner.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const res = await copy(owner.token, handId, { as: 'summary' }).expect(200);

    expect(res.text).toBe(showdownInSpanish);
  });

  it('lets every Participant of a Room copy a Hand of its Queue, and nobody else', async () => {
    const master = await newAccount(running.httpServer);
    const guest = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const code = room.body.code as string;
    const masterSocket = await RoomClient.connect(running.wsUrl, master.token);
    const guestSocket = await RoomClient.connect(running.wsUrl, guest.token);
    clients.push(masterSocket, guestSocket);
    masterSocket.send('room.join', { code, displayName: 'Javier' });
    await masterSocket.next('room.snapshot');
    guestSocket.send('room.join', { code, displayName: 'Marta' });
    await guestSocket.next('room.snapshot');
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ text: freshHandHistory('pokerstars-showdown.txt') })
      .expect(201);
    const { entries } = await guestSocket.next<{
      entries: { handId: string }[];
    }>('queue.entriesAdded');
    const handId = entries[0].handId;
    const query = { as: 'summary', language: 'es', timeZone: 'Europe/Madrid' };

    for (const participant of [master, guest]) {
      const res = await copy(participant.token, handId, query).expect(200);
      expect(res.text).toBe(showdownInSpanish);
    }
    for (const path of [`/api/hands/${handId}`, `/api/hands/${handId}/copy`]) {
      const refused = await request(running.httpServer)
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
      expect(refused.body).toEqual({ reason: 'hand-not-found' });
    }
    const notAHand = await copy(guest.token, 'not-a-uuid', query).expect(404);
    expect(notAHand.body).toEqual({ reason: 'hand-not-found' });
  });

  it('refuses a version, a language or a time zone it does not know', async () => {
    const owner = await newAccount(running.httpServer);
    const handId = await importText(
      owner.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );

    const queries: Record<string, string>[] = [
      {},
      { as: 'pdf' },
      { as: 'summary', language: 'fr' },
      { as: 'summary', timeZone: 'Mars/Olympus_Mons' },
    ];
    for (const query of queries) {
      const res = await copy(owner.token, handId, query).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-hand-copy' });
    }
  });

  describe('as its Hand History', () => {
    it('gives back each Hand of a Library import as exactly its own block of the file', async () => {
      const owner = await newAccount(running.httpServer);
      const text = freshHandHistory('pokerstars-session.txt');
      await importText(owner.token, text);

      const stored = await libraryHands(owner.token);
      const copied: string[] = [];
      for (const { id } of stored) {
        const res = await copy(owner.token, id, { as: 'history' }).expect(200);
        expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
        expect(res.headers['cache-control']).toBe('private, no-cache');
        copied.push(res.text);
      }

      expect(stored).toHaveLength(4);
      expect(copied.sort()).toEqual(blocksOf(text).sort());
      for (const { id } of stored) {
        const hand = await request(running.httpServer)
          .get(`/api/hands/${id}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200);
        expect(hand.body.hasHistory).toBe(true);
      }
    });

    it('gives back each Hand imported into a Room as exactly its own block of the file', async () => {
      const master = await newAccount(running.httpServer);
      const { code, socket } = await openRoom(master.token);
      const text = freshHandHistory('pokerstars-session.txt');
      const preview = await request(running.httpServer)
        .post(`/api/rooms/${code}/imports/previews`)
        .set('Authorization', `Bearer ${master.token}`)
        .attach('file', Buffer.from(text), 'session.txt')
        .expect(201);
      await request(running.httpServer)
        .post(`/api/rooms/${code}/imports`)
        .set('Authorization', `Bearer ${master.token}`)
        .send({ previews: [preview.body.id as string] })
        .expect(201);
      const { entries } = await socket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');

      const copied: string[] = [];
      for (const { handId } of entries) {
        const hand = await request(running.httpServer)
          .get(`/api/hands/${handId}`)
          .set('Authorization', `Bearer ${master.token}`)
          .expect(200);
        expect(hand.body.hasHistory).toBe(true);
        const res = await copy(master.token, handId, { as: 'history' }).expect(
          200,
        );
        copied.push(res.text);
      }

      expect(copied.sort()).toEqual(blocksOf(text).sort());
    });

    it('gives back a Hand pasted from a forum post as it was pasted, without the post around it', async () => {
      const master = await newAccount(running.httpServer);
      const { code, socket } = await openRoom(master.token);
      const hand = freshHandHistory('pokerstars-showdown.txt').trim();
      const post = [
        'What do you think of the turn call?',
        '',
        hand,
        '',
        'Thanks!',
      ].join('\n');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${master.token}`)
        .send({ text: post })
        .expect(201);
      const { entries } = await socket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');

      const res = await copy(master.token, entries[0].handId, {
        as: 'history',
      }).expect(200);

      expect(res.text).toBe(hand);
    });

    it('answers no-history for a Hand stored before its text was kept', async () => {
      const owner = await newAccount(running.httpServer);
      const handId = await importText(
        owner.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );
      // As every Hand imported before Runout kept the text.
      const db = new pg.Client(inject('databaseUrl'));
      await db.connect();
      try {
        await db.query('update hands set hand_history = null where id = $1', [
          handId,
        ]);
      } finally {
        await db.end();
      }

      const res = await copy(owner.token, handId, { as: 'history' }).expect(
        404,
      );
      const hand = await request(running.httpServer)
        .get(`/api/hands/${handId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body).toEqual({ reason: 'no-history' });
      expect(hand.body.hasHistory).toBe(false);
    });

    it('says in each Library row whether its Hand History was kept', async () => {
      const owner = await newAccount(running.httpServer);
      const [kept, lost] = freshHandHistory('pokerstars-session.txt').split(
        /\n\n\n/,
      );
      const keptId = await importText(owner.token, kept);
      await importText(owner.token, lost);
      const lostId = (await libraryHands(owner.token)).find(
        (row) => row.id !== keptId,
      )!.id;
      const db = new pg.Client(inject('databaseUrl'));
      await db.connect();
      try {
        await db.query('update hands set hand_history = null where id = $1', [
          lostId,
        ]);
      } finally {
        await db.end();
      }

      const rows = (await libraryHands(owner.token)) as {
        id: string;
        hasHistory: boolean;
      }[];

      expect(
        Object.fromEntries(rows.map((row) => [row.id, row.hasHistory])),
      ).toEqual({ [keptId]: true, [lostId]: false });
    });

    it('refuses someone who cannot see the Hand the same way as the Hand itself', async () => {
      const owner = await newAccount(running.httpServer);
      const stranger = await newAccount(running.httpServer);
      const handId = await importText(
        owner.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      const res = await copy(stranger.token, handId, { as: 'history' }).expect(
        404,
      );

      expect(res.body).toEqual({ reason: 'hand-not-found' });
    });
  });
});
