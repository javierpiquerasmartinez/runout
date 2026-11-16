import request from 'supertest';
import type { PlanCatalogue } from '../src/plans/plan-catalogue.js';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { newAccount } from './support/google.js';
import { freshHandHistory, manyHands } from './support/hand-histories.js';
import { betaLimitOf, libraryLimitOf } from './support/plans.js';
import { RoomClient } from './support/room-client.js';

describe('A Library holds at most its Plan’s Hands (e2e)', () => {
  let running: RunningApp;
  let catalogue: PlanCatalogue;
  let administrator: { token: string; id: string };
  const clients: RoomClient[] = [];

  /** Runout with these Plans, and its Administrator signed in. */
  async function start(plans?: PlanCatalogue) {
    if (plans) catalogue = plans;
    running = await startApp({
      administratorEmails: [ADMINISTRATOR_EMAIL],
      planCatalogue: plans,
    });
    administrator = await signInAdministrator(running);
  }

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running?.close();
  });

  /** A new Account on Beta, from an Invitation that offers it. */
  function betaAccount() {
    return invitedAccount(running, administrator.token, uniqueEmail('beta'));
  }

  const as = (token: string) => ({
    get: (path: string) =>
      request(running.httpServer)
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(running.httpServer)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(running.httpServer)
        .delete(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  /** Previews `text` and confirms it into the Library, expecting `status`. */
  async function importHands(token: string, text: string, status: number) {
    const preview = await as(token)
      .post('/library/imports/previews')
      .send({ text })
      .expect(201);
    return as(token)
      .post('/library/imports')
      .send({ previews: [preview.body.id as string] })
      .expect(status);
  }

  async function libraryOf(token: string) {
    const res = await as(token).get('/library/hands').expect(200);
    return res.body as { total: number; hands: { id: string }[] };
  }

  describe('with Beta’s Library holding at most 6 Hands', () => {
    beforeEach(() => start(betaLimitOf(6)));

    it('takes a Beta’s imports up to the limit, and refuses whole one that would go past it, naming the Plan', async () => {
      const ana = await betaAccount();
      await importHands(ana.token, manyHands(4), 201);

      const refused = await importHands(ana.token, manyHands(3), 409);

      expect(refused.body).toMatchObject({
        reason: 'library-full',
        hands: 3,
        held: 4,
        limit: 6,
        plan: 'beta',
      });
      expect((await libraryOf(ana.token)).total).toBe(4);
      await importHands(ana.token, manyHands(2), 201);
      expect((await libraryOf(ana.token)).total).toBe(6);
    });

    it('makes room for as many Hands as are removed from a Beta’s Library', async () => {
      const ana = await betaAccount();
      await importHands(ana.token, manyHands(6), 201);
      const { hands } = await libraryOf(ana.token);

      await as(ana.token)
        .delete('/library/hands')
        .send({ handIds: hands.slice(0, 2).map((hand) => hand.id) })
        .expect(200);

      await importHands(ana.token, manyHands(3), 409);
      await importHands(ana.token, manyHands(2), 201);
      expect((await libraryOf(ana.token)).total).toBe(6);
    });

    it('leaves a Pro’s Library to Pro’s limit', async () => {
      const pro = await newAccount(running.httpServer);

      await importHands(pro.token, manyHands(7), 201);

      expect((await libraryOf(pro.token)).total).toBe(7);
    });

    it('keeps every Hand of a Library already over its Plan’s limit, and refuses every import into it', async () => {
      const ana = await betaAccount();
      await importHands(ana.token, manyHands(6), 201);

      catalogue.beta.libraryHands = 3;

      const refused = await importHands(ana.token, manyHands(1), 409);
      expect(refused.body).toMatchObject({
        reason: 'library-full',
        hands: 1,
        held: 6,
        limit: 3,
        plan: 'beta',
      });
      expect((await libraryOf(ana.token)).total).toBe(6);
    });

    it('holds an Administrator Impersonating a Beta to the Beta’s limit', async () => {
      const ana = await betaAccount();
      const impersonation = await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/impersonations`)
        .expect(201);

      const refused = await importHands(
        impersonation.body.token as string,
        manyHands(7),
        409,
      );

      expect(refused.body).toMatchObject({
        reason: 'library-full',
        limit: 6,
        plan: 'beta',
      });
      expect((await libraryOf(ana.token)).total).toBe(0);
    });

    it('never refuses Hands uploaded into a Room’s Queue for a full Library', async () => {
      const ana = await betaAccount();
      await importHands(ana.token, manyHands(6), 201);
      const room = await as(ana.token)
        .post('/rooms')
        .send({ name: 'Martes NL10', displayName: 'Ana' })
        .expect(201);
      const code = room.body.code as string;
      const socket = await RoomClient.connect(running.wsUrl, ana.token);
      clients.push(socket);
      socket.send('room.join', { code, displayName: 'Ana' });
      await socket.next('room.snapshot');

      const pasted = await as(ana.token)
        .post(`/rooms/${code}/hands`)
        .send({ text: freshHandHistory('pokerstars-session.txt') })
        .expect(201);

      expect(pasted.body.imported).toBeGreaterThan(0);
      expect((await libraryOf(ana.token)).total).toBe(6);
    });

    it('says in the current identity how many Hands a Library its Plan holds below Runout’s own limit may hold', async () => {
      const ana = await betaAccount();
      const pro = await newAccount(running.httpServer);
      const impersonation = await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/impersonations`)
        .expect(201);

      const me = async (token: string) =>
        (await as(token).get('/identities/me').expect(200)).body as {
          libraryLimit?: number;
        };

      expect((await me(ana.token)).libraryLimit).toBe(6);
      expect(await me(pro.token)).not.toHaveProperty('libraryLimit');
      expect((await me(impersonation.body.token as string)).libraryLimit).toBe(
        6,
      );
      expect(await me(administrator.token)).not.toHaveProperty('libraryLimit');
    });
  });

  it('never holds an Administrator acting as themselves to their Plan’s limit', async () => {
    await start(libraryLimitOf(6));

    await importHands(administrator.token, manyHands(7), 201);

    expect((await libraryOf(administrator.token)).total).toBe(7);
  });

  it('gives a Beta’s Library 20,000 Hands, and a Pro’s only Runout’s own limit, which the current identity leaves out', async () => {
    await start();
    const beta = await betaAccount();
    const pro = await newAccount(running.httpServer);

    const me = async (token: string) =>
      (await as(token).get('/identities/me').expect(200)).body as {
        libraryLimit?: number;
      };

    expect((await me(beta.token)).libraryLimit).toBe(20_000);
    expect(await me(pro.token)).not.toHaveProperty('libraryLimit');
  });
});
