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
});
