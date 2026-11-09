import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { newAccount } from './support/google.js';

interface Goal {
  id: string;
  name: string;
  description: string;
  target: number;
  currentValue: number;
  startDate: string;
  deadline: string;
  createdAt: string;
}

/** A Goal the server accepts, for a test to change one field of. */
const valid = {
  name: 'Jugar 50.000 manos',
  target: 50000,
  startDate: '2026-11-01',
  deadline: '2026-12-31',
};

describe('Goals (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function create(token: string, body: object) {
    return request(running.httpServer)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function list(token: string): Promise<Goal[]> {
    const res = await request(running.httpServer)
      .get('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as { goals: Goal[] }).goals;
  }

  it('creates a Goal at 0, trimmed, and lists it', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      name: '  Jugar 50.000 manos ',
      description: ' Solo en NL50. \n',
      target: 50000,
      startDate: '2026-11-01',
      deadline: '2026-12-31',
    }).expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Jugar 50.000 manos',
      description: 'Solo en NL50.',
      target: 50000,
      currentValue: 0,
      startDate: '2026-11-01',
      deadline: '2026-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await list(account.token)).toEqual([created.body]);
  });

  /** Expects creating a Goal with these fields changed to be refused for `reason`. */
  async function expectRefused(
    token: string,
    changed: object,
    reason: string,
  ): Promise<void> {
    const res = await create(token, { ...valid, ...changed }).expect(400);
    expect(res.body).toMatchObject({ reason });
  }

  it('leaves the description empty when none is sent', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, valid).expect(201);

    expect(created.body).toMatchObject({ description: '' });
  });

  it('accepts a name and a description at their limits, once trimmed', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      ...valid,
      name: ` ${'n'.repeat(80)} `,
      description: ` ${'d'.repeat(500)} `,
    }).expect(201);

    expect(created.body).toMatchObject({
      name: 'n'.repeat(80),
      description: 'd'.repeat(500),
    });
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['too long', 'n'.repeat(81)],
    ['not text', 7],
  ])('refuses a name that is %s', async (_case, name) => {
    const account = await newAccount(running.httpServer);

    await expectRefused(account.token, { name }, 'invalid-goal-name');
  });

  it.each([
    ['too long', 'd'.repeat(501)],
    ['not text', 7],
  ])('refuses a description that is %s', async (_case, description) => {
    const account = await newAccount(running.httpServer);

    await expectRefused(
      account.token,
      { description },
      'invalid-goal-description',
    );
  });

  it.each([
    ['the smallest', 0.01],
    ['two decimals', 5.55],
    ['a decimal prone to binary error', 1234567.89],
    ['the largest', 999999999],
  ])('keeps a Target exact: %s', async (_case, target) => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, { ...valid, target }).expect(
      201,
    );

    expect(created.body).toMatchObject({ target });
    expect((await list(account.token))[0]).toMatchObject({ target });
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -1],
    ['too large', 1000000000],
    ['too large by a cent', 999999999.01],
    ['with three decimals', 5.555],
    ['tiny', 1e-7],
    ['a number written as text', '50000'],
    ['not a number', 'mucho'],
    ['nothing', null],
  ])('refuses a Target that is %s', async (_case, target) => {
    const account = await newAccount(running.httpServer);

    await expectRefused(account.token, { target }, 'invalid-goal-target');
  });

  it('cannot set the Current Value when creating', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      ...valid,
      currentValue: 320,
    }).expect(201);

    expect(created.body).toMatchObject({ currentValue: 0 });
  });

  it.each([
    ['startDate', 'invalid-goal-start-date'],
    ['deadline', 'invalid-goal-deadline'],
  ])("refuses a %s that isn't a real date", async (field, reason) => {
    const account = await newAccount(running.httpServer);

    for (const date of [undefined, '', '2026-02-30', '2026-13-01', '1/12/2026', 7]) {
      await expectRefused(account.token, { [field]: date }, reason);
    }
  });

  it('refuses a Deadline before the Start Date', async () => {
    const account = await newAccount(running.httpServer);

    await expectRefused(
      account.token,
      { startDate: '2026-11-10', deadline: '2026-11-09' },
      'goal-deadline-before-start',
    );
  });

  it('accepts a Deadline on the Start Date', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      ...valid,
      startDate: '2026-11-10',
      deadline: '2026-11-10',
    }).expect(201);

    expect(created.body).toMatchObject({
      startDate: '2026-11-10',
      deadline: '2026-11-10',
    });
  });

  it('accepts a Start Date in the past or the future', async () => {
    const account = await newAccount(running.httpServer);

    await create(account.token, {
      ...valid,
      startDate: '2020-01-01',
    }).expect(201);
    await create(account.token, {
      ...valid,
      startDate: '2026-12-31',
    }).expect(201);
  });

  it('lists every Goal of the Account in the same order each time', async () => {
    const account = await newAccount(running.httpServer);
    for (const name of ['Primero', 'Segundo', 'Tercero']) {
      await running.clock.advance(1000);
      await create(account.token, { ...valid, name }).expect(201);
    }

    const names = (await list(account.token)).map(({ name }) => name);

    expect(names).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it("never lists another Account's Goals", async () => {
    const ana = await newAccount(running.httpServer);
    const berta = await newAccount(running.httpServer);
    await create(ana.token, valid).expect(201);

    expect(await list(berta.token)).toEqual([]);
  });

  function change(token: string, id: string, body: object) {
    return request(running.httpServer)
      .patch(`/api/goals/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  /** A Goal of this Account, for a test to change. */
  async function goalOf(token: string): Promise<Goal> {
    const created = await create(token, valid).expect(201);
    return created.body as Goal;
  }

  it.each([
    ['up', 320],
    ['past the Target', 60000],
    ['with two decimals', 5.55],
    ['with a decimal prone to binary error', 1234567.89],
    ['to the largest', 999999999],
  ])('changes the Current Value %s, and it comes back exact', async (_case, currentValue) => {
    const account = await newAccount(running.httpServer);
    const goal = await goalOf(account.token);

    const changed = await change(account.token, goal.id, {
      currentValue,
    }).expect(200);

    expect(changed.body).toEqual({ ...goal, currentValue });
    expect(await list(account.token)).toEqual([changed.body]);
  });

  it('lets the Current Value go down, and back to 0', async () => {
    const account = await newAccount(running.httpServer);
    const goal = await goalOf(account.token);
    await change(account.token, goal.id, { currentValue: 320 }).expect(200);

    const lower = await change(account.token, goal.id, {
      currentValue: 12.5,
    }).expect(200);
    expect(lower.body).toMatchObject({ currentValue: 12.5 });

    const zero = await change(account.token, goal.id, {
      currentValue: 0,
    }).expect(200);
    expect(zero.body).toMatchObject({ currentValue: 0 });
  });

  it('changes nothing but the Current Value', async () => {
    const account = await newAccount(running.httpServer);
    const goal = await goalOf(account.token);

    const changed = await change(account.token, goal.id, {
      name: 'Otro nombre',
      target: 1,
      startDate: '2020-01-01',
      deadline: '2020-01-02',
      currentValue: 7,
    }).expect(200);

    expect(changed.body).toEqual({ ...goal, currentValue: 7 });
  });

  it.each([
    ['negative', -1],
    ['too large', 1000000000],
    ['too large by a cent', 999999999.01],
    ['with three decimals', 5.555],
    ['tiny', 1e-7],
    ['a number written as text', '320'],
    ['not a number', 'mucho'],
    ['nothing', null],
  ])('refuses a Current Value that is %s', async (_case, currentValue) => {
    const account = await newAccount(running.httpServer);
    const goal = await goalOf(account.token);

    const res = await change(account.token, goal.id, {
      currentValue,
    }).expect(400);

    expect(res.body).toMatchObject({ reason: 'invalid-goal-current-value' });
    expect(await list(account.token)).toEqual([goal]);
  });

  it("answers 404 for another Account's Goal, even with an invalid value, and leaves it alone", async () => {
    const ana = await newAccount(running.httpServer);
    const berta = await newAccount(running.httpServer);
    const goal = await goalOf(ana.token);

    for (const currentValue of [7, -1]) {
      const res = await change(berta.token, goal.id, {
        currentValue,
      }).expect(404);
      expect(res.body).toMatchObject({ reason: 'goal-not-found' });
    }
    expect(await list(ana.token)).toEqual([goal]);
  });

  it.each([
    ['that no Goal has', 'b0a7c1de-3f4e-4c55-9a11-2f3b4c5d6e7f'],
    ["that can't be any Goal's", 'not-an-id'],
  ])('answers 404 for an id %s', async (_case, id) => {
    const account = await newAccount(running.httpServer);

    const res = await change(account.token, id, { currentValue: 7 }).expect(
      404,
    );

    expect(res.body).toMatchObject({ reason: 'goal-not-found' });
  });

  it('refuses anyone without an Account', async () => {
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

    await request(running.httpServer).get('/api/goals').expect(401);
    await request(running.httpServer).post('/api/goals').send(valid).expect(401);
    const listed = await request(running.httpServer)
      .get('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(listed.body).toMatchObject({ reason: 'account-required' });
    const created = await create(token, valid).expect(403);
    expect(created.body).toMatchObject({ reason: 'account-required' });
    const goal = await goalOf(master.token);
    await request(running.httpServer)
      .patch(`/api/goals/${goal.id}`)
      .send({ currentValue: 7 })
      .expect(401);
    const changed = await change(token, goal.id, { currentValue: 7 }).expect(
      403,
    );
    expect(changed.body).toMatchObject({ reason: 'account-required' });
    expect(await list(master.token)).toEqual([goal]);
  });
});

describe('Goals during Impersonation (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
  });

  afterEach(async () => {
    await running.close();
  });

  it('lets an Administrator impersonating an Account see its Goals and create one', async () => {
    const administrator = await signInAdministrator(running);
    const ana = await invitedAccount(
      running,
      administrator.token,
      uniqueEmail('ana'),
    );
    const post = (token: string, path: string) =>
      request(running.httpServer)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`);
    const listOf = (token: string) =>
      request(running.httpServer)
        .get('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    const kept = await post(ana.token, '/goals').send(valid).expect(201);
    const impersonation = await post(
      administrator.token,
      `/admin/accounts/${ana.id}/impersonations`,
    ).expect(201);
    const token = impersonation.body.token as string;

    const seen = await listOf(token);
    expect(seen.body).toEqual({ goals: [kept.body] });

    const created = await post(token, '/goals')
      .send({ ...valid, name: 'Estudiar ICM' })
      .expect(201);
    const after = await listOf(ana.token);
    expect(after.body.goals).toContainEqual(created.body);
  });

  it("lets an Administrator impersonating an Account change its Goals' Current Value", async () => {
    const administrator = await signInAdministrator(running);
    const ana = await invitedAccount(
      running,
      administrator.token,
      uniqueEmail('ana'),
    );
    const kept = await request(running.httpServer)
      .post('/api/goals')
      .set('Authorization', `Bearer ${ana.token}`)
      .send(valid)
      .expect(201);
    const impersonation = await request(running.httpServer)
      .post(`/api/admin/accounts/${ana.id}/impersonations`)
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(201);

    const changed = await request(running.httpServer)
      .patch(`/api/goals/${kept.body.id as string}`)
      .set('Authorization', `Bearer ${impersonation.body.token as string}`)
      .send({ currentValue: 320 })
      .expect(200);

    expect(changed.body).toEqual({ ...kept.body, currentValue: 320 });
  });
});
