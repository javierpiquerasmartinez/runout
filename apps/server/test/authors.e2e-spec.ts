import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Author {
  identityId: string;
  displayName: string;
}

interface Preview {
  id: string;
  hands: { hero: string; author: Author; heroMatched: boolean }[];
  discarded: { text: string; reason: string }[];
}

interface QueueEntry {
  id: string;
  handId: string;
  site: string;
  siteHandId: string;
  author: Author;
}

/** The showdown fixture's Hero, and an opponent whose seat it could be recorded from. */
const HERO = 'iMapleAA';
const OPPONENT = 'BIRCHWOODS';

/** The same Hand as recorded from the opponent's seat. */
function fromOpponentSeat(text: string): string {
  return text.replace(
    `Dealt to ${HERO} [Js 8s]`,
    `Dealt to ${OPPONENT} [As 7d]`,
  );
}

describe('Authors, Screen Names and duplicates (e2e)', () => {
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

  function setScreenNames(token: string, screenNames: unknown) {
    return request(running.httpServer)
      .put('/api/identities/me/screen-names')
      .set('Authorization', `Bearer ${token}`)
      .send({ screenNames });
  }

  function preview(token: string, code: string, text: string) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/imports/previews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text });
  }

  function confirm(token: string, code: string, previews: string[]) {
    return request(running.httpServer)
      .post(`/api/rooms/${code}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .send({ previews });
  }

  /** Previews and confirms `text`, returning the preview. */
  async function importText(
    token: string,
    code: string,
    text: string,
  ): Promise<Preview> {
    const read = await preview(token, code, text).expect(201);
    await confirm(token, code, [read.body.id]).expect(201);
    return read.body as Preview;
  }

  describe('Screen Names', () => {
    it('are declared as a list, trimmed, without repeats, and kept with the identity', async () => {
      const me = await issueIdentity();

      const res = await setScreenNames(me.token, [
        ' iMapleAA ',
        'Javier_PS',
        'imapleaa',
        '',
      ]).expect(200);

      expect(res.body.screenNames).toEqual(['iMapleAA', 'Javier_PS']);
      const later = await request(running.httpServer)
        .get('/api/identities/me')
        .set('Authorization', `Bearer ${me.token}`)
        .expect(200);
      expect(later.body).toEqual({
        id: me.id,
        displayName: null,
        screenNames: ['iMapleAA', 'Javier_PS'],
      });
    });

    it('refuses anything that is not a list of names', async () => {
      const me = await issueIdentity();

      const notAList = await setScreenNames(me.token, 'iMapleAA').expect(400);
      const tooLong = await setScreenNames(me.token, ['x'.repeat(51)]).expect(
        400,
      );

      expect(notAList.body).toEqual({ reason: 'invalid-screen-names' });
      expect(tooLong.body).toEqual({ reason: 'invalid-screen-names' });
    });
  });

  describe('Author matching', () => {
    it('makes the Participant whose Screen Names include the Hero the Author, whoever imports it', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      await setScreenNames(guest.token, ['imapleaa']).expect(200);

      const read = await importText(
        master.token,
        code,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      expect(read.hands[0]).toMatchObject({
        hero: HERO,
        author: { identityId: guest.id, displayName: 'Marta' },
        heroMatched: true,
      });
      const { entries } = await socket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      expect(entries[0].author).toEqual({
        identityId: guest.id,
        displayName: 'Marta',
      });
    });

    it('falls back to the Importer when no Screen Name matches, and says so in the preview', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      await setScreenNames(master.token, ['Javier_PS']).expect(200);

      const read = await importText(
        guest.token,
        code,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      expect(read.hands[0]).toMatchObject({
        hero: HERO,
        author: { identityId: guest.id, displayName: 'Marta' },
        heroMatched: false,
      });
      const { entries } = await socket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      expect(entries[0].author.identityId).toBe(guest.id);
    });

    it('matches Hands pasted anywhere in the Room too', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      await setScreenNames(guest.token, [HERO]).expect(200);

      await request(running.httpServer)
        .post(`/api/rooms/${code}/hands`)
        .set('Authorization', `Bearer ${master.token}`)
        .send({ text: freshHandHistory('pokerstars-showdown.txt') })
        .expect(201);

      const { entries } = await socket.next<{ entries: QueueEntry[] }>(
        'queue.entriesAdded',
      );
      expect(entries[0].author.identityId).toBe(guest.id);
    });

    it('never matches a Screen Name of someone outside the Room', async () => {
      const master = await issueIdentity();
      const stranger = await issueIdentity();
      const code = await createRoom(master.token);
      await join(master.token, code, 'Javier');
      await setScreenNames(stranger.token, [HERO]).expect(200);

      const read = await importText(
        master.token,
        code,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      expect(read.hands[0]).toMatchObject({
        author: { identityId: master.id },
        heroMatched: false,
      });
    });

    it('does not reprocess Hands already imported when Screen Names change', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      await setScreenNames(guest.token, [HERO]).expect(200);
      await importText(
        master.token,
        code,
        freshHandHistory('pokerstars-showdown.txt'),
      );

      await setScreenNames(guest.token, []).expect(200);
      await setScreenNames(master.token, [HERO]).expect(200);

      const { queue } = await join(master.token, code, 'Javier');
      expect(queue[0].author.identityId).toBe(guest.id);
    });
  });

  describe('duplicates', () => {
    it('reports a Hand already imported as a duplicate in the preview and leaves it out', async () => {
      const master = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      const text = freshHandHistory('pokerstars-showdown.txt');
      await importText(master.token, code, text);
      await socket.next('queue.entriesAdded');

      const again = await preview(master.token, code, text).expect(201);

      expect(again.body.hands).toEqual([]);
      expect(again.body.discarded).toEqual([
        { text: text.trim(), reason: 'duplicate' },
      ]);
      await confirm(master.token, code, [again.body.id]).expect(201);
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue).toHaveLength(1);
    });

    it('reports the same Hand twice in one text as one Hand and one duplicate', async () => {
      const master = await issueIdentity();
      const code = await createRoom(master.token);
      await join(master.token, code, 'Javier');
      const text = freshHandHistory('pokerstars-showdown.txt');

      const read = await preview(
        master.token,
        code,
        `${text}\n\n\n${text}`,
      ).expect(201);

      expect(read.body.hands).toHaveLength(1);
      expect(read.body.discarded).toEqual([
        { text: text.trim(), reason: 'duplicate' },
      ]);
    });

    it('skips a duplicate pasted anywhere in the Room and reports it', async () => {
      const master = await issueIdentity();
      const code = await createRoom(master.token);
      await join(master.token, code, 'Javier');
      const text = freshHandHistory('pokerstars-showdown.txt');
      const paste = () =>
        request(running.httpServer)
          .post(`/api/rooms/${code}/hands`)
          .set('Authorization', `Bearer ${master.token}`)
          .send({ text });
      await paste().expect(201);

      const again = await paste().expect(201);

      expect(again.body).toEqual({
        imported: 0,
        discarded: [{ text: text.trim(), reason: 'duplicate' }],
      });
    });

    it('puts a Hand imported in another Room in this Queue too, with the Author it already had', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const first = await createRoom(master.token);
      await join(master.token, first, 'Javier');
      await join(guest.token, first, 'Marta');
      await setScreenNames(guest.token, [HERO]).expect(200);
      const text = freshHandHistory('pokerstars-showdown.txt');
      await importText(master.token, first, text);
      const { queue: firstQueue } = await join(master.token, first, 'Javier');

      // A week later, in a Room the Author isn't even in.
      const later = await createRoom(master.token);
      await join(master.token, later, 'Javier');
      const read = await importText(master.token, later, text);

      expect(read.discarded).toEqual([]);
      expect(read.hands[0].author).toEqual({
        identityId: guest.id,
        displayName: 'Marta',
      });
      const { queue } = await join(master.token, later, 'Javier');
      // The same Hand (ADR 0002), referenced by a Queue Entry of its own.
      expect(queue.map((entry) => entry.handId)).toEqual([
        firstQueue[0].handId,
      ]);
      expect(queue[0].id).not.toBe(firstQueue[0].id);
      expect(queue[0].author.identityId).toBe(guest.id);
    });

    it('skips a Hand another Importer queued between the preview and the confirm', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      const text = freshHandHistory('pokerstars-showdown.txt');
      const first = await preview(master.token, code, text).expect(201);
      const second = await preview(guest.token, code, text).expect(201);

      await confirm(master.token, code, [first.body.id]).expect(201);
      const late = await confirm(guest.token, code, [second.body.id]).expect(
        201,
      );

      expect(late.body).toEqual({ imported: 0 });
      await socket.next('queue.entriesAdded');
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue).toHaveLength(1);
    });

    it('keeps the same hand ID from another Hero as a separate Hand, related to the first', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const { socket } = await join(master.token, code, 'Javier');
      await join(guest.token, code, 'Marta');
      await setScreenNames(master.token, [HERO]).expect(200);
      await setScreenNames(guest.token, [OPPONENT]).expect(200);
      const text = freshHandHistory('pokerstars-showdown.txt');

      await importText(master.token, code, text);
      const seenByOpponent = await importText(
        guest.token,
        code,
        fromOpponentSeat(text),
      );

      expect(seenByOpponent.discarded).toEqual([]);
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue).toHaveLength(2);
      expect(queue[0].handId).not.toBe(queue[1].handId);
      expect(queue.map((entry) => entry.author.identityId)).toEqual([
        master.id,
        guest.id,
      ]);
      // Same Poker Site and hand ID: the Queue shows them as the same real-world hand.
      expect(queue[0]).toMatchObject({
        site: 'pokerstars',
        siteHandId: queue[1].siteHandId,
      });
      expect(queue[1].site).toBe('pokerstars');
      await socket.next('queue.entriesAdded');
    });
  });

  describe('reassigning the Author', () => {
    async function roomWithOneHand() {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const code = await createRoom(master.token);
      const masterRoom = await join(master.token, code, 'Javier');
      const guestRoom = await join(guest.token, code, 'Marta');
      await importText(
        master.token,
        code,
        freshHandHistory('pokerstars-showdown.txt'),
      );
      const { entries } = await masterRoom.socket.next<{
        entries: QueueEntry[];
      }>('queue.entriesAdded');
      return {
        master,
        guest,
        code,
        masterSocket: masterRoom.socket,
        guestSocket: guestRoom.socket,
        handId: entries[0].handId,
      };
    }

    it('lets the Master give any Hand in the Queue another Author, for everyone', async () => {
      const { master, guest, code, masterSocket, guestSocket, handId } =
        await roomWithOneHand();

      masterSocket.send('queue.reassignAuthor', {
        handId,
        authorId: guest.id,
      });

      for (const socket of [masterSocket, guestSocket]) {
        expect(await socket.next('queue.authorChanged')).toEqual({
          handId,
          author: { identityId: guest.id, displayName: 'Marta' },
        });
      }
      const { queue } = await join(master.token, code, 'Javier');
      expect(queue[0].author.identityId).toBe(guest.id);
    });

    it('refuses a Guest who tries to reassign, and changes nothing', async () => {
      const { guest, guestSocket, masterSocket, handId } =
        await roomWithOneHand();

      guestSocket.send('queue.reassignAuthor', {
        handId,
        authorId: guest.id,
      });

      expect(await guestSocket.next('rejected')).toEqual({
        command: 'queue.reassignAuthor',
        reason: 'not-master',
      });
      expect(masterSocket.all('queue.authorChanged')).toEqual([]);
    });

    it('refuses an Author who is not a Participant of the Room', async () => {
      const { masterSocket, handId } = await roomWithOneHand();
      const stranger = await issueIdentity();

      masterSocket.send('queue.reassignAuthor', {
        handId,
        authorId: stranger.id,
      });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'queue.reassignAuthor',
        reason: 'author-not-in-room',
      });
    });

    it('refuses a Hand that is not in the Queue', async () => {
      const { guest, masterSocket } = await roomWithOneHand();

      masterSocket.send('queue.reassignAuthor', {
        handId: '00000000-0000-4000-8000-000000000000',
        authorId: guest.id,
      });

      expect(await masterSocket.next('rejected')).toEqual({
        command: 'queue.reassignAuthor',
        reason: 'hand-not-in-queue',
      });
    });
  });
});
