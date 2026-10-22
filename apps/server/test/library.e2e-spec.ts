import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Preview {
  id: string;
  format: string | null;
  hands: { hero: string; playedAt: string }[];
  discarded: { text: string; reason: string }[];
}

interface LibraryPage {
  total: number;
  page: number;
  pageSize: number;
  hands: {
    id: string;
    site: string;
    hero: string;
    holeCards: string[];
    playedAt: string;
    stake: { bigBlind: number; currency: string };
    /** The Hero's Result, as an Amount. */
    result: number;
    summary: {
      positions: string[];
      finalPot: number;
      finalStreet: string;
      showdown: boolean;
    };
  }[];
}

const MB = 1024 * 1024;

describe('Importing into the Library and listing it (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  function previewText(token: string, text: string) {
    return request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${token}`)
      .send({ text });
  }

  function confirm(token: string, previews: string[]) {
    return request(running.httpServer)
      .post('/api/library/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ previews });
  }

  async function importText(token: string, text: string): Promise<number> {
    const preview = await previewText(token, text).expect(201);
    const res = await confirm(token, [(preview.body as Preview).id]).expect(
      201,
    );
    return res.body.imported as number;
  }

  function list(token: string, query: Record<string, string> = {}) {
    return request(running.httpServer)
      .get('/api/library/hands')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  it('previews pasted Hands, adds them on confirm and lists them newest first', async () => {
    const account = await newAccount(running.httpServer);

    const preview = await previewText(
      account.token,
      freshHandHistory('pokerstars-session.txt'),
    ).expect(201);
    expect((preview.body as Preview).format).toBe('pokerstars');
    expect((preview.body as Preview).hands).toHaveLength(4);
    expect((await list(account.token).expect(200)).body.total).toBe(0);

    const confirmed = await confirm(account.token, [
      (preview.body as Preview).id,
    ]).expect(201);
    expect(confirmed.body).toEqual({ imported: 4 });

    const page = (await list(account.token).expect(200)).body as LibraryPage;
    expect(page.total).toBe(4);
    expect(page.page).toBe(1);
    const playedAt = page.hands.map((hand) => hand.playedAt);
    expect(playedAt).toEqual([...playedAt].sort().reverse());
    expect(page.hands[0]).toEqual({
      id: expect.any(String),
      site: 'pokerstars',
      siteHandId: expect.any(String),
      hero: 'iMapleAA',
      holeCards: expect.any(Array),
      playedAt: expect.any(String),
      stake: expect.objectContaining({ bigBlind: 10, currency: 'EUR' }),
      result: expect.any(Number),
      marked: false,
      tags: [],
      summary: expect.objectContaining({ finalStreet: expect.any(String) }),
    });
  });

  it('lists each Hand with the Hero’s Result', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));

    const page = (await list(account.token).expect(200)).body as LibraryPage;
    // Newest first: a folded big blind, a fold, a fold on the turn after
    // raising, and a won pot net of the uncalled bet handed back.
    expect(page.hands.map((hand) => hand.result)).toEqual([-10, 0, -30, 31]);
  });

  it('lists the Result a Room import stored, for a Hand added to the Library later', async () => {
    const account = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' })
      .expect(201);
    const code = room.body.code as string;
    const socket = await RoomClient.connect(running.wsUrl, account.token);
    clients.push(socket);
    socket.send('room.join', { code, displayName: 'Javier' });
    await socket.next('room.snapshot');
    const text = freshHandHistory('pokerstars-showdown.txt');
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ text })
      .expect(201);
    await socket.next('queue.entriesAdded');

    await importText(account.token, text);

    const page = (await list(account.token).expect(200)).body as LibraryPage;
    expect(page.hands.map((hand) => hand.result)).toEqual([49]);
  });

  it('paginates on the server, with the total', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    await importText(
      account.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    const all = (await list(account.token).expect(200)).body as LibraryPage;
    expect(all.total).toBe(5);

    const pages: LibraryPage[] = [];
    for (const page of ['1', '2', '3']) {
      pages.push(
        (await list(account.token, { pageSize: '2', page }).expect(200))
          .body as LibraryPage,
      );
    }

    expect(
      pages.map(({ total, page, pageSize }) => [total, page, pageSize]),
    ).toEqual([
      [5, 1, 2],
      [5, 2, 2],
      [5, 3, 2],
    ]);
    expect(pages.map((page) => page.hands.length)).toEqual([2, 2, 1]);
    expect(pages.flatMap((page) => page.hands).map((hand) => hand.id)).toEqual(
      all.hands.map((hand) => hand.id),
    );
  });

  it('marks Hands already in this Library as duplicates and adds only the new ones', async () => {
    const account = await newAccount(running.httpServer);
    const [first, second] = freshHandHistory('pokerstars-session.txt').split(
      /\n\n\n/,
    );
    await importText(account.token, first);

    const preview = (
      await previewText(
        account.token,
        [first, second, 'not a hand'].join('\n\n\n'),
      ).expect(201)
    ).body as Preview;
    expect(preview.hands).toHaveLength(1);
    expect(preview.discarded.map((entry) => entry.reason).sort()).toEqual([
      'duplicate',
      'unrecognised-format',
    ]);

    await confirm(account.token, [preview.id]).expect(201);
    expect((await list(account.token).expect(200)).body.total).toBe(2);
  });

  it('adds a Hand another Account already has without storing it twice, and shares its Notes', async () => {
    const marta = await newAccount(running.httpServer);
    const javier = await newAccount(running.httpServer);
    const text = freshHandHistory('pokerstars-showdown.txt');
    await importText(marta.token, text);

    const preview = (await previewText(javier.token, text).expect(201))
      .body as Preview;
    expect(preview.hands).toHaveLength(1);
    expect(preview.discarded).toEqual([]);
    await confirm(javier.token, [preview.id]).expect(201);

    const [martas] = ((await list(marta.token).expect(200)).body as LibraryPage)
      .hands;
    const [javiers] = (
      (await list(javier.token).expect(200)).body as LibraryPage
    ).hands;
    expect(javiers.id).toBe(martas.id);
    const notes = await request(running.httpServer)
      .get(`/api/hands/${javiers.id}/notes`)
      .set('Authorization', `Bearer ${javier.token}`)
      .expect(200);
    expect(notes.body).toEqual({ notes: [], marked: false });
  });

  it('accepts Hands of any Hero, CoinPoker’s `Hero` included', async () => {
    const account = await newAccount(running.httpServer);

    expect(
      await importText(
        account.token,
        freshHandHistory('coinpoker-session.txt'),
      ),
    ).toBeGreaterThan(0);

    const page = (await list(account.token).expect(200)).body as LibraryPage;
    expect(page.hands.every((hand) => hand.hero === 'Hero')).toBe(true);
    expect(page.hands.every((hand) => hand.site === 'coinpoker')).toBe(true);
  });

  it('refuses a file over 20 MB with the same reason as in Rooms', async () => {
    const account = await newAccount(running.httpServer);

    const res = await request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${account.token}`)
      .attach('file', Buffer.alloc(20 * MB + 1, 'a'), 'huge.txt')
      .expect(413);

    expect(res.body).toEqual({ reason: 'file-too-large' });
  });

  it('reads an uploaded file into a preview', async () => {
    const account = await newAccount(running.httpServer);

    const res = await request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${account.token}`)
      .attach(
        'file',
        Buffer.from(freshHandHistory('pokerstars-showdown.txt')),
        'showdown.txt',
      )
      .expect(201);

    expect((res.body as Preview).hands).toHaveLength(1);
  });

  it('confirms only the importer’s own Library previews', async () => {
    const marta = await newAccount(running.httpServer);
    const javier = await newAccount(running.httpServer);
    const preview = (
      await previewText(
        marta.token,
        freshHandHistory('pokerstars-showdown.txt'),
      )
    ).body as Preview;

    const res = await confirm(javier.token, [preview.id]).expect(404);

    expect(res.body).toEqual({ reason: 'preview-not-found' });
  });

  it('keeps Room previews and Library previews apart', async () => {
    const account = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const code = room.body.code as string;
    const socket = await RoomClient.connect(running.wsUrl, account.token);
    clients.push(socket);
    socket.send('room.join', { code, displayName: 'Javier' });
    await socket.next('room.snapshot');
    const roomPreview = await request(running.httpServer)
      .post(`/api/rooms/${code}/imports/previews`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ text: freshHandHistory('pokerstars-showdown.txt') })
      .expect(201);
    const libraryPreview = (
      await previewText(
        account.token,
        freshHandHistory('pokerstars-showdown.txt'),
      ).expect(201)
    ).body as Preview;

    await confirm(account.token, [roomPreview.body.id as string]).expect(404);
    await request(running.httpServer)
      .post(`/api/rooms/${code}/imports`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ previews: [libraryPreview.id] })
      .expect(404);
  });

  it('keeps anonymous Participants out of any Library', async () => {
    const master = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' });
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${room.body.code as string}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);
    const token = guest.body.token as string;

    for (const res of [
      await list(token),
      await previewText(token, freshHandHistory('pokerstars-showdown.txt')),
      await confirm(token, []),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ reason: 'account-required' });
    }
  });

  describe('who can see a Hand', () => {
    it('serves a Library Hand with its Timeline to who has it, and to nobody else', async () => {
      const owner = await newAccount(running.httpServer);
      const stranger = await newAccount(running.httpServer);
      await importText(
        owner.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );
      const [hand] = ((await list(owner.token).expect(200)).body as LibraryPage)
        .hands;

      const res = await request(running.httpServer)
        .get(`/api/hands/${hand.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(res.body.timeline.states.length).toBeGreaterThan(1);

      for (const path of [
        `/api/hands/${hand.id}`,
        `/api/hands/${hand.id}/notes`,
      ]) {
        const refused = await request(running.httpServer)
          .get(path)
          .set('Authorization', `Bearer ${stranger.token}`)
          .expect(404);
        expect(refused.body).toEqual({ reason: 'hand-not-found' });
      }
    });

    it('stops showing a Room Hand to its Participants once the Room closes, unless it is in their Library', async () => {
      const master = await newAccount(running.httpServer);
      const guest = await newAccount(running.httpServer);
      const room = await request(running.httpServer)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${master.token}`)
        .send({ name: 'Martes NL10', displayName: 'Javier' });
      const code = room.body.code as string;
      const masterSocket = await RoomClient.connect(
        running.wsUrl,
        master.token,
      );
      const guestSocket = await RoomClient.connect(running.wsUrl, guest.token);
      clients.push(masterSocket, guestSocket);
      masterSocket.send('room.join', { code, displayName: 'Javier' });
      await masterSocket.next('room.snapshot');
      guestSocket.send('room.join', { code, displayName: 'Marta' });
      await guestSocket.next('room.snapshot');
      const text = freshHandHistory('pokerstars-showdown.txt');
      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ text })
        .expect(201);
      const { entries } = await masterSocket.next<{
        entries: { handId: string }[];
      }>('queue.entriesAdded');
      const handId = entries[0].handId;
      await importText(guest.token, text);

      for (const person of [master, guest]) {
        await request(running.httpServer)
          .get(`/api/hands/${handId}`)
          .set('Authorization', `Bearer ${person.token}`)
          .expect(200);
      }

      masterSocket.send('room.close');
      await guestSocket.next('room.closed');

      await request(running.httpServer)
        .get(`/api/hands/${handId}`)
        .set('Authorization', `Bearer ${guest.token}`)
        .expect(200);
      await request(running.httpServer)
        .get(`/api/hands/${handId}`)
        .set('Authorization', `Bearer ${master.token}`)
        .expect(404);
    });
  });
});
