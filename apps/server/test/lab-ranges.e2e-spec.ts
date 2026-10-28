import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Range {
  id: string;
  name: string;
  combos: Record<string, number>;
}

interface RangeSummary {
  id: string;
  name: string;
  comboCount: number;
  percent: number;
}

describe('Ranges in the Lab (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function create(token: string, body: object) {
    return request(running.httpServer)
      .post('/api/lab/ranges')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function save(token: string, id: string, body: object) {
    return request(running.httpServer)
      .put(`/api/lab/ranges/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function read(token: string, id: string) {
    return request(running.httpServer)
      .get(`/api/lab/ranges/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function duplicate(token: string, id: string) {
    return request(running.httpServer)
      .post(`/api/lab/ranges/${id}/copies`)
      .set('Authorization', `Bearer ${token}`);
  }

  function remove(token: string, id: string) {
    return request(running.httpServer)
      .delete(`/api/lab/ranges/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function list(token: string): Promise<RangeSummary[]> {
    const res = await request(running.httpServer)
      .get('/api/lab/ranges')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as RangeSummary[];
  }

  it('creates a Range and reads it back with its Combos', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      name: '  OR BTN vs BB ',
      combos: { AsKs: 100, AhKd: 50 },
    }).expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'OR BTN vs BB',
      combos: { AsKs: 100, AhKd: 50 },
    });
    const id = (created.body as Range).id;
    expect((await read(account.token, id).expect(200)).body).toEqual(
      created.body,
    );
  });

  it('saves a Range over what it held', async () => {
    const account = await newAccount(running.httpServer);
    const { id } = (
      await create(account.token, { name: 'OR BTN', combos: { AsKs: 100 } })
    ).body as Range;

    const saved = await save(account.token, id, {
      name: 'OR BTN vs BB',
      combos: { QsQh: 25 },
    }).expect(200);

    expect(saved.body).toEqual({
      id,
      name: 'OR BTN vs BB',
      combos: { QsQh: 25 },
    });
    expect((await read(account.token, id)).body).toEqual(saved.body);
  });

  it('saves an empty Range', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      name: 'Later',
      combos: {},
    }).expect(201);

    expect((created.body as Range).combos).toEqual({});
  });

  it('lists the Ranges by name, with how wide each is and without Combos', async () => {
    const account = await newAccount(running.httpServer);
    const pairs = Object.fromEntries(
      ['AsAh', 'AsAd', 'AsAc', 'AhAd', 'AhAc', 'AdAc'].map((c) => [c, 100]),
    );
    await create(account.token, { name: 'zz aces', combos: pairs });
    // AKo at 50 %: 12 Combos counted as 6.
    const offsuit = Object.fromEntries(
      ['s', 'h', 'd', 'c'].flatMap((high) =>
        ['s', 'h', 'd', 'c']
          .filter((low) => low !== high)
          .map((low) => [`A${high}K${low}`, 50]),
      ),
    );
    await create(account.token, { name: 'AKo half', combos: offsuit });
    await create(account.token, { name: 'empty', combos: {} });

    expect(await list(account.token)).toEqual([
      {
        id: expect.any(String),
        name: 'AKo half',
        comboCount: 6,
        percent: (6 / 1326) * 100,
      },
      { id: expect.any(String), name: 'empty', comboCount: 0, percent: 0 },
      {
        id: expect.any(String),
        name: 'zz aces',
        comboCount: 6,
        percent: (6 / 1326) * 100,
      },
    ]);
  });

  it('duplicates a Range with its Combos under the first free "(copia)" name', async () => {
    const account = await newAccount(running.httpServer);
    const { id } = (
      await create(account.token, {
        name: 'OR BTN',
        combos: { AsKs: 100, AhKd: 50 },
      })
    ).body as Range;

    const first = await duplicate(account.token, id).expect(201);
    const second = await duplicate(account.token, id).expect(201);
    // A name freed is taken again, whatever case it was in.
    await save(account.token, (first.body as Range).id, {
      name: 'OR BTN (COPIA 3)',
      combos: {},
    });
    const third = await duplicate(account.token, id).expect(201);

    expect(first.body).toEqual({
      id: expect.any(String),
      name: 'OR BTN (copia)',
      combos: { AsKs: 100, AhKd: 50 },
    });
    expect((second.body as Range).name).toBe('OR BTN (copia 2)');
    expect((third.body as Range).name).toBe('OR BTN (copia)');
    expect((await read(account.token, (third.body as Range).id)).body).toEqual(
      third.body,
    );
    expect((await list(account.token)).map((each) => each.name).sort()).toEqual(
      ['OR BTN', 'OR BTN (COPIA 3)', 'OR BTN (copia 2)', 'OR BTN (copia)'],
    );
  });

  it("names a copy in the Account's language, within 60 characters", async () => {
    const account = await newAccount(running.httpServer);
    await request(running.httpServer)
      .patch('/api/identities/me/preferences')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ language: 'en' })
      .expect(200);
    const long = `${'x'.repeat(55)} BTN`;
    const { id } = (await create(account.token, { name: long, combos: {} }))
      .body as Range;

    const first = (await duplicate(account.token, id).expect(201))
      .body as Range;
    const second = (await duplicate(account.token, id).expect(201))
      .body as Range;

    expect(first.name).toBe(`${'x'.repeat(53)} (copy)`);
    expect(second.name).toBe(`${'x'.repeat(51)} (copy 2)`);
  });

  it('deletes a Range', async () => {
    const account = await newAccount(running.httpServer);
    const { id } = (await create(account.token, { name: 'OR BTN', combos: {} }))
      .body as Range;
    await create(account.token, { name: '3B BB', combos: {} });

    await remove(account.token, id).expect(204);

    expect((await list(account.token)).map((each) => each.name)).toEqual([
      '3B BB',
    ]);
    expect((await read(account.token, id)).status).toBe(404);
    expect((await remove(account.token, id)).status).toBe(404);
    // Its name is free again.
    await create(account.token, { name: 'or btn', combos: {} }).expect(201);
  });

  it('refuses a name that is empty, too long or not text', async () => {
    const account = await newAccount(running.httpServer);

    for (const name of ['', '   ', 'x'.repeat(61), 7, undefined]) {
      const res = await create(account.token, { name, combos: {} }).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-range-name' });
    }
    await create(account.token, { name: 'x'.repeat(60), combos: {} }).expect(
      201,
    );
  });

  it('keeps names unique per Account, ignoring case, when creating and saving', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    const { id } = (await create(javier.token, { name: 'OR BTN', combos: {} }))
      .body as Range;
    await create(javier.token, { name: '3B BB', combos: {} }).expect(201);

    const taken = await create(javier.token, {
      name: ' or btn',
      combos: {},
    }).expect(409);
    const clash = await save(javier.token, id, {
      name: '3b bb',
      combos: {},
    }).expect(409);

    expect(taken.body).toEqual({ reason: 'range-name-taken' });
    expect(clash.body).toEqual({ reason: 'range-name-taken' });
    // Its own name in another case is no clash.
    await save(javier.token, id, { name: 'OR btn', combos: {} }).expect(200);
    // Another Account's Ranges are its own business.
    await create(marta.token, { name: 'OR BTN', combos: {} }).expect(201);
  });

  it('refuses, as a whole, Combos that are unknown or out of order and Frequencies outside 1–100', async () => {
    const account = await newAccount(running.httpServer);
    const { id } = (await create(account.token, { name: 'OR', combos: {} }))
      .body as Range;

    for (const combos of [
      { AsKs: 100, XxYy: 100 },
      { AsKs: 100, KsAs: 100 },
      // A pair writes its suits in s h d c order.
      { AhAs: 100 },
      { AsKs: 0 },
      { AsKs: 101 },
      { AsKs: 50.5 },
      { AsKs: '100' },
      ['AsKs'],
      'AsKs',
      undefined,
    ]) {
      const created = await create(account.token, { name: 'New', combos });
      expect(created.status).toBe(400);
      expect(created.body).toEqual({ reason: 'invalid-range-combos' });
      const saved = await save(account.token, id, { name: 'OR', combos });
      expect(saved.status).toBe(400);
      expect(saved.body).toEqual({ reason: 'invalid-range-combos' });
    }
    expect((await list(account.token)).map((each) => each.name)).toEqual([
      'OR',
    ]);
    expect((await read(account.token, id)).body).toEqual({
      id,
      name: 'OR',
      combos: {},
    });
  });

  it("answers 404 for a Range that isn't the caller's, or isn't there", async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const { id } = (
      await create(owner.token, { name: 'OR BTN', combos: { AsKs: 100 } })
    ).body as Range;

    for (const res of [
      await read(stranger.token, id),
      await save(stranger.token, id, { name: 'Mine', combos: {} }),
      // Not theirs comes before what is wrong with the body.
      await save(stranger.token, id, { name: '', combos: { XxYy: 1 } }),
      await duplicate(stranger.token, id),
      await remove(stranger.token, id),
      await duplicate(owner.token, 'not-a-uuid'),
      await remove(owner.token, 'not-a-uuid'),
      await read(owner.token, '00000000-0000-4000-8000-000000000000'),
      await read(owner.token, 'not-a-uuid'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'range-not-found' });
    }
    expect(await list(stranger.token)).toEqual([]);
    expect((await read(owner.token, id)).body).toMatchObject({
      name: 'OR BTN',
    });
  });

  it('refuses anyone without an Account', async () => {
    const master = await newAccount(running.httpServer);
    const { id } = (await create(master.token, { name: 'OR', combos: {} }))
      .body as Range;
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
      await request(running.httpServer)
        .get('/api/lab/ranges')
        .set('Authorization', `Bearer ${token}`),
      await read(token, id),
      await create(token, { name: 'Mine', combos: {} }),
      await save(token, id, { name: 'Mine', combos: {} }),
      await duplicate(token, id),
      await remove(token, id),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ reason: 'account-required' });
    }
    for (const res of [
      await request(running.httpServer).get('/api/lab/ranges'),
      await request(running.httpServer).get(`/api/lab/ranges/${id}`),
      await request(running.httpServer)
        .post('/api/lab/ranges')
        .send({ name: 'Mine', combos: {} }),
      await request(running.httpServer).post(`/api/lab/ranges/${id}/copies`),
      await request(running.httpServer).delete(`/api/lab/ranges/${id}`),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ reason: 'unauthenticated' });
    }
  });
});
