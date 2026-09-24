import request from 'supertest';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Participant {
  identityId: string;
  displayName: string;
}

describe('Profile and preferences (e2e)', () => {
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

  function me(token: string) {
    return request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  function changePreferences(token: string, changes: unknown) {
    return request(running.httpServer)
      .patch('/api/identities/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send(changes as object);
  }

  function rename(token: string, displayName: unknown) {
    return request(running.httpServer)
      .put('/api/identities/me/display-name')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName });
  }

  async function join(token: string, code: string, displayName: string) {
    const socket = await RoomClient.connect(running.wsUrl, token);
    clients.push(socket);
    socket.send('room.join', { code, displayName });
    await socket.next('room.snapshot');
    return socket;
  }

  describe('preferences', () => {
    it('starts every identity on the defaults: classic four-colour deck, big blinds with pot percentages, dark, Spanish', async () => {
      const res = await request(running.httpServer).post('/api/identities');

      expect(res.body.identity.preferences).toEqual({
        deckStyle: 'classic',
        fourColour: true,
        potPercentage: true,
        displayUnit: 'big-blinds',
        theme: 'dark',
        language: 'es',
      });
    });

    it('stores a change with the identity and gives it back on the next visit', async () => {
      const { token } = await issueIdentity();

      const res = await changePreferences(token, {
        deckStyle: 'full-suit',
        displayUnit: 'both',
      }).expect(200);
      expect(res.body).toMatchObject({
        deckStyle: 'full-suit',
        displayUnit: 'both',
        theme: 'dark',
      });

      await changePreferences(token, {
        fourColour: false,
        potPercentage: false,
        theme: 'system',
        language: 'en',
      }).expect(200);

      expect((await me(token)).body.preferences).toEqual({
        deckStyle: 'full-suit',
        fourColour: false,
        potPercentage: false,
        displayUnit: 'both',
        theme: 'system',
        language: 'en',
      });
    });

    it('keeps one identity’s preferences to itself', async () => {
      const javier = await issueIdentity();
      const marta = await issueIdentity();

      await changePreferences(javier.token, { theme: 'light' }).expect(200);

      expect((await me(marta.token)).body.preferences.theme).toBe('dark');
    });

    it.each([
      { deckStyle: 'jumbo' },
      { fourColour: 'yes' },
      { displayUnit: 'chips' },
      { theme: 'sepia' },
      { language: 'fr' },
      { speed: 2 },
    ])('refuses %o with a reason, changing nothing', async (changes) => {
      const { token } = await issueIdentity();

      const res = await changePreferences(token, {
        theme: 'light',
        ...changes,
      }).expect(400);

      expect(res.body).toEqual({ reason: 'invalid-preferences' });
      expect((await me(token)).body.preferences.theme).toBe('dark');
    });

    it('asks for the identity’s token', async () => {
      const res = await request(running.httpServer)
        .patch('/api/identities/me/preferences')
        .send({ theme: 'light' })
        .expect(401);

      expect(res.body).toEqual({ reason: 'unauthenticated' });
    });
  });

  describe('Display Name', () => {
    it('can be changed at any time and is kept with the identity', async () => {
      const { token } = await issueIdentity();

      const res = await rename(token, '  Javi  ').expect(200);

      expect(res.body.displayName).toBe('Javi');
      expect((await me(token)).body.displayName).toBe('Javi');
    });

    it.each(['', '   ', 'x'.repeat(41), 42])(
      'refuses %j with a reason',
      async (displayName) => {
        const { token } = await issueIdentity();

        const res = await rename(token, displayName).expect(400);

        expect(res.body).toEqual({ reason: 'invalid-display-name' });
      },
    );

    it('changes at once for everyone in the Room the Participant is in', async () => {
      const master = await issueIdentity();
      const guest = await issueIdentity();
      const created = await request(running.httpServer)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${master.token}`)
        .send({ name: 'Martes NL10', displayName: 'Javier' });
      const code = created.body.code as string;
      const masterSocket = await join(master.token, code, 'Javier');
      const guestSocket = await join(guest.token, code, 'Marta');

      await rename(guest.token, 'Marta G.').expect(200);

      const heard = await masterSocket.nextMessage<Participant>(
        'room.participantRenamed',
      );
      expect(heard.data).toEqual({
        identityId: guest.id,
        displayName: 'Marta G.',
      });
      expect(heard.revision).toEqual(expect.any(Number));
      // Their own tab hears it too.
      await guestSocket.next('room.participantRenamed');

      // And whoever asks for the Room from here on reads the new name.
      masterSocket.send('room.resync');
      const snapshot = await masterSocket.next<{
        participants: Participant[];
      }>('room.snapshot');
      expect(snapshot.participants).toContainEqual(
        expect.objectContaining({
          identityId: guest.id,
          displayName: 'Marta G.',
        }),
      );
    });

    it('says nothing to a Room when the name is the one it already had', async () => {
      const master = await issueIdentity();
      const created = await request(running.httpServer)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${master.token}`)
        .send({ name: 'Martes NL10', displayName: 'Javier' });
      const socket = await join(master.token, created.body.code, 'Javier');

      await rename(master.token, 'Javier').expect(200);
      await rename(master.token, 'Javi').expect(200);

      await socket.until('room.participantRenamed');
      expect(socket.all('room.participantRenamed')).toEqual([
        { identityId: master.id, displayName: 'Javi' },
      ]);
    });
  });
});
