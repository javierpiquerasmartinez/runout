import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount, personaIdToken } from './support/google.js';

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
    it('starts every identity on the defaults: classic four-colour deck, big blinds with pot percentages, dark, Spanish, the Graph Colours of the board', async () => {
      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: personaIdToken('new-subject') });

      expect(res.body.identity.preferences).toEqual({
        deckStyle: 'classic',
        fourColour: true,
        potPercentage: true,
        displayUnit: 'big-blinds',
        theme: 'dark',
        language: 'es',
        resultColour: 'teal',
        allInEvColour: 'amber',
        showdownColour: 'blue',
        nonShowdownColour: 'red',
        shownStats: null,
      });
    });

    it('stores a change with the identity and gives it back on the next visit', async () => {
      const { token } = await newAccount(running.httpServer);

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
        resultColour: 'violet',
        nonShowdownColour: 'violet',
      }).expect(200);

      expect((await me(token)).body.preferences).toEqual({
        deckStyle: 'full-suit',
        fourColour: false,
        potPercentage: false,
        displayUnit: 'both',
        theme: 'system',
        language: 'en',
        resultColour: 'violet',
        allInEvColour: 'amber',
        showdownColour: 'blue',
        nonShowdownColour: 'violet',
        shownStats: null,
      });
    });

    it('keeps one identity’s preferences to itself', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);

      await changePreferences(javier.token, { theme: 'light' }).expect(200);

      expect((await me(marta.token)).body.preferences.theme).toBe('dark');
    });

    it.each([
      { deckStyle: 'jumbo' },
      { fourColour: 'yes' },
      { displayUnit: 'chips' },
      { theme: 'sepia' },
      { language: 'fr' },
      { resultColour: 'gold' },
      { showdownColour: '#ff0000' },
      { speed: 2 },
    ])('refuses %o with a reason, changing nothing', async (changes) => {
      const { token } = await newAccount(running.httpServer);

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

  describe('the Stats an Account sees', () => {
    /** A choice of Stats has no order: compare it as a sorted list. */
    function sorted(keys: string[]): string[] {
      return [...keys].sort((a, b) => a.localeCompare(b));
    }

    /** Another Sign-in of the same Account, as from a second browser. */
    async function signInAgain(subject: string): Promise<string> {
      const res = await request(running.httpServer)
        .post('/api/sessions/google')
        .send({ idToken: personaIdToken(subject) })
        .expect(201);
      return res.body.token as string;
    }

    it('reads the default, as nothing chosen, on a new Account', async () => {
      const { token } = await newAccount(running.httpServer);

      expect((await me(token)).body.preferences.shownStats).toBeNull();
    });

    it('keeps a choice of Stats, as a set, for every Sign-in of the Account', async () => {
      const subject = `stats-${Math.random()}`;
      const first = await signInAgain(subject);

      const res = await changePreferences(first, {
        shownStats: ['cbet-turn', 'vpip', 'afq'],
      }).expect(200);
      expect(sorted(res.body.shownStats)).toEqual(['afq', 'cbet-turn', 'vpip']);

      const second = await signInAgain(subject);
      expect(sorted((await me(second)).body.preferences.shownStats)).toEqual([
        'afq',
        'cbet-turn',
        'vpip',
      ]);
    });

    it('keeps a choice of no Stats at all apart from the default', async () => {
      const { token } = await newAccount(running.httpServer);

      await changePreferences(token, { shownStats: [] }).expect(200);

      expect((await me(token)).body.preferences.shownStats).toEqual([]);
    });

    it('goes back to the default when the choice is cleared (Restablecer)', async () => {
      const { token } = await newAccount(running.httpServer);
      await changePreferences(token, { shownStats: ['vpip'] }).expect(200);

      await changePreferences(token, { shownStats: null }).expect(200);

      expect((await me(token)).body.preferences.shownStats).toBeNull();
    });

    it('keeps the choice when other Preferences change', async () => {
      const { token } = await newAccount(running.httpServer);
      await changePreferences(token, { shownStats: ['pfr'] }).expect(200);

      await changePreferences(token, { theme: 'light' }).expect(200);

      expect((await me(token)).body.preferences.shownStats).toEqual(['pfr']);
    });

    it.each([
      { shownStats: ['vpip', 'not-a-stat'] },
      { shownStats: ['vpip', 'vpip'] },
      { shownStats: 'vpip' },
      { shownStats: [1] },
      { shownStats: {} },
    ])('refuses %o with a reason, changing nothing', async (changes) => {
      const { token } = await newAccount(running.httpServer);
      await changePreferences(token, { shownStats: ['pfr'] }).expect(200);

      const res = await changePreferences(token, changes).expect(400);

      expect(res.body).toEqual({ reason: 'invalid-preferences' });
      expect((await me(token)).body.preferences.shownStats).toEqual(['pfr']);
    });

    it('drops, on reading, a Stat Runout no longer knows', async () => {
      const { token, id } = await newAccount(running.httpServer);
      await changePreferences(token, { shownStats: ['vpip'] }).expect(200);
      // As a choice made before Runout retired a Stat.
      const db = new pg.Client(inject('databaseUrl'));
      await db.connect();
      try {
        await db.query(
          'update preferences set shown_stats = $1 where identity_id = $2',
          [['vpip', 'retired-stat', 'pfr'], id],
        );
      } finally {
        await db.end();
      }

      expect(sorted((await me(token)).body.preferences.shownStats)).toEqual([
        'pfr',
        'vpip',
      ]);
    });

    it('is only an Account’s: an anonymous identity reads the default and can’t choose', async () => {
      const master = await newAccount(running.httpServer);
      const created = await request(running.httpServer)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${master.token}`)
        .send({ name: 'Martes NL10', displayName: 'Javier' })
        .expect(201);
      const issued = await request(running.httpServer)
        .post(`/api/rooms/${created.body.code}/guests`)
        .send({ displayName: 'Marta' })
        .expect(201);
      const anonymous = issued.body.token as string;

      expect((await me(anonymous)).body.preferences.shownStats).toBeNull();
      const res = await changePreferences(anonymous, {
        shownStats: ['vpip'],
      }).expect(403);

      expect(res.body).toEqual({ reason: 'account-required' });
      expect((await me(anonymous)).body.preferences.shownStats).toBeNull();
      // Their other Preferences are theirs to change, as before.
      await changePreferences(anonymous, { theme: 'light' }).expect(200);
    });

    it('lets an Administrator Impersonating an Account read and change its choice', async () => {
      const impersonating = await startApp({
        administratorEmails: [ADMINISTRATOR_EMAIL],
      });
      try {
        const administrator = await signInAdministrator(impersonating);
        const ana = await invitedAccount(
          impersonating,
          administrator.token,
          uniqueEmail('ana'),
        );
        await request(impersonating.httpServer)
          .patch('/api/identities/me/preferences')
          .set('Authorization', `Bearer ${ana.token}`)
          .send({ shownStats: ['vpip'] })
          .expect(200);
        const { body: impersonation } = await request(impersonating.httpServer)
          .post(`/api/admin/accounts/${ana.id}/impersonations`)
          .set('Authorization', `Bearer ${administrator.token}`)
          .expect(201);
        const asAna = impersonation.token as string;

        const read = await request(impersonating.httpServer)
          .get('/api/identities/me')
          .set('Authorization', `Bearer ${asAna}`)
          .expect(200);
        expect(read.body.preferences.shownStats).toEqual(['vpip']);
        await request(impersonating.httpServer)
          .patch('/api/identities/me/preferences')
          .set('Authorization', `Bearer ${asAna}`)
          .send({ shownStats: ['pfr'] })
          .expect(200);

        const theirs = await request(impersonating.httpServer)
          .get('/api/identities/me')
          .set('Authorization', `Bearer ${ana.token}`)
          .expect(200);
        expect(theirs.body.preferences.shownStats).toEqual(['pfr']);
      } finally {
        await impersonating.close();
      }
    });
  });

  describe('Display Name', () => {
    it('can be changed at any time and is kept with the identity', async () => {
      const { token } = await newAccount(running.httpServer);

      const res = await rename(token, '  Javi  ').expect(200);

      expect(res.body.displayName).toBe('Javi');
      expect((await me(token)).body.displayName).toBe('Javi');
    });

    it.each(['', '   ', 'x'.repeat(41), 42])(
      'refuses %j with a reason',
      async (displayName) => {
        const { token } = await newAccount(running.httpServer);

        const res = await rename(token, displayName).expect(400);

        expect(res.body).toEqual({ reason: 'invalid-display-name' });
      },
    );

    it('changes at once for everyone in the Room the Participant is in', async () => {
      const master = await newAccount(running.httpServer);
      const guest = await newAccount(running.httpServer);
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
      const master = await newAccount(running.httpServer);
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
