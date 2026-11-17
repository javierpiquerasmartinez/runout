import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { newAccount } from './support/google.js';

interface SavedFilter {
  id: string;
  name: string;
  criteria: { facts: string[]; stat: string | null };
  dropped: number;
}

const THREE_BET_OOP = {
  facts: ['pot-type:3-bet', '!hero-position:BTN,CO'],
  stat: null,
};

describe('Saved Filters in the Library (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
  });

  afterEach(async () => {
    await running.close();
  });

  const as = (token: string) => ({
    list: () =>
      request(running.httpServer)
        .get('/api/library/saved-filters')
        .set('Authorization', `Bearer ${token}`),
    create: (body: unknown) =>
      request(running.httpServer)
        .post('/api/library/saved-filters')
        .set('Authorization', `Bearer ${token}`)
        .send(body as object),
    rename: (id: string, name: unknown) =>
      request(running.httpServer)
        .patch(`/api/library/saved-filters/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name }),
    replace: (id: string, criteria: unknown) =>
      request(running.httpServer)
        .put(`/api/library/saved-filters/${id}/criteria`)
        .set('Authorization', `Bearer ${token}`)
        .send({ criteria }),
    delete: (id: string) =>
      request(running.httpServer)
        .delete(`/api/library/saved-filters/${id}`)
        .set('Authorization', `Bearer ${token}`),
  });

  it('saves the Más filtros criteria under a name and lists them by name', async () => {
    const account = await newAccount(running.httpServer);

    const created = await as(account.token)
      .create({ name: '  3-bet OOP como caller ', criteria: THREE_BET_OOP })
      .expect(201);
    await as(account.token)
      .create({
        name: 'BTN vs BB',
        criteria: { facts: ['hero-position:BTN'], stat: 'vpip:taken' },
      })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: '3-bet OOP como caller',
      criteria: THREE_BET_OOP,
      dropped: 0,
    });
    const listed = (await as(account.token).list().expect(200))
      .body as SavedFilter[];
    expect(listed).toEqual([
      created.body,
      {
        id: expect.any(String),
        name: 'BTN vs BB',
        criteria: { facts: ['hero-position:BTN'], stat: 'vpip:taken' },
        dropped: 0,
      },
    ]);
  });

  it('renames, replaces the criteria of and deletes a Saved Filter', async () => {
    const account = await newAccount(running.httpServer);
    const { body: saved } = await as(account.token)
      .create({ name: 'SRP', criteria: THREE_BET_OOP })
      .expect(201);

    const renamed = await as(account.token)
      .rename(saved.id, 'Botes 3-bet')
      .expect(200);
    expect(renamed.body).toMatchObject({
      id: saved.id,
      name: 'Botes 3-bet',
      criteria: THREE_BET_OOP,
    });

    const replaced = await as(account.token)
      .replace(saved.id, { facts: ['pot-type:4-bet'], stat: null })
      .expect(200);
    expect(replaced.body).toMatchObject({
      id: saved.id,
      name: 'Botes 3-bet',
      criteria: { facts: ['pot-type:4-bet'], stat: null },
    });

    await as(account.token).delete(saved.id).expect(204);
    expect((await as(account.token).list().expect(200)).body).toEqual([]);
    const gone = await as(account.token).delete(saved.id).expect(404);
    expect(gone.body).toEqual({ reason: 'saved-filter-not-found' });
  });

  it('keeps names unique per Account, ignoring case', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    await as(javier.token)
      .create({ name: 'Multiway', criteria: THREE_BET_OOP })
      .expect(201);
    const { body: other } = await as(javier.token)
      .create({ name: 'Heads-up', criteria: THREE_BET_OOP })
      .expect(201);

    const taken = await as(javier.token)
      .create({ name: 'MULTIWAY ', criteria: THREE_BET_OOP })
      .expect(409);
    expect(taken.body).toEqual({ reason: 'saved-filter-name-taken' });
    const renamed = await as(javier.token)
      .rename(other.id, 'multiway')
      .expect(409);
    expect(renamed.body).toEqual({ reason: 'saved-filter-name-taken' });
    // Another Account's Saved Filters are its own business.
    await as(marta.token)
      .create({ name: 'multiway', criteria: THREE_BET_OOP })
      .expect(201);
  });

  it('refuses a bad name, and criteria that are empty or not a Filter', async () => {
    const account = await newAccount(running.httpServer);

    for (const name of ['', '   ', 'x'.repeat(41), 7, undefined]) {
      const res = await as(account.token)
        .create({ name, criteria: THREE_BET_OOP })
        .expect(400);
      expect(res.body).toEqual({ reason: 'invalid-saved-filter-name' });
    }
    for (const criteria of [
      undefined,
      'pot-type:3-bet',
      { facts: [], stat: null },
      { facts: ['no-such-fact:1'], stat: null },
      { facts: ['pot-type:7-bet'], stat: null },
      { facts: [], stat: 'vpip:sometimes' },
      { facts: [7], stat: null },
    ]) {
      const res = await as(account.token)
        .create({ name: 'Spot', criteria })
        .expect(400);
      expect(res.body).toEqual({ reason: 'invalid-saved-filter-criteria' });
    }
    await as(account.token)
      .create({
        name: 'x'.repeat(40),
        criteria: { facts: [], stat: 'vpip:taken' },
      })
      .expect(201);
  });

  it("never shows or changes another Account's Saved Filters", async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const { body: saved } = await as(javier.token)
      .create({ name: 'Mío', criteria: THREE_BET_OOP })
      .expect(201);

    expect((await as(marta.token).list().expect(200)).body).toEqual([]);
    for (const res of [
      await as(marta.token).rename(saved.id, 'Suyo'),
      await as(marta.token).replace(saved.id, THREE_BET_OOP),
      await as(marta.token).delete(saved.id),
      await as(marta.token).delete('not-a-uuid'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'saved-filter-not-found' });
    }
    expect((await as(javier.token).list().expect(200)).body).toEqual([saved]);
  });

  it('lets an Administrator Impersonating an Account see and use its Saved Filters', async () => {
    const administrator = await signInAdministrator(running);
    const ana = await invitedAccount(
      running,
      administrator.token,
      uniqueEmail('ana'),
    );
    const { body: saved } = await as(ana.token)
      .create({ name: 'De Ana', criteria: THREE_BET_OOP })
      .expect(201);

    const { body: impersonation } = await request(running.httpServer)
      .post(`/api/admin/accounts/${ana.id}/impersonations`)
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(201);
    const acting = as(impersonation.token as string);

    expect((await acting.list().expect(200)).body).toEqual([saved]);
    await acting
      .create({ name: 'Hecho por soporte', criteria: THREE_BET_OOP })
      .expect(201);
    expect(
      ((await as(ana.token).list().expect(200)).body as SavedFilter[]).map(
        (filter) => filter.name,
      ),
    ).toEqual(['De Ana', 'Hecho por soporte']);
    // The Administrator's own Account has none of them.
    expect((await as(administrator.token).list().expect(200)).body).toEqual([]);
  });

  it('requires an Account', async () => {
    await request(running.httpServer)
      .get('/api/library/saved-filters')
      .expect(401);
  });
});
