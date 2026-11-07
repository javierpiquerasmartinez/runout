import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Milestone {
  id: string;
  title: string;
  description: string;
  date: string;
  done: boolean;
  createdAt: string;
}

interface MilestoneList {
  milestones: Milestone[];
  hasAny: boolean;
}

describe('Milestones in the Calendar (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function create(token: string, body: object) {
    return request(running.httpServer)
      .post('/api/calendar/milestones')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function listing(token: string, query: Record<string, string>) {
    return request(running.httpServer)
      .get('/api/calendar/milestones')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  async function list(
    token: string,
    from: string,
    to: string,
  ): Promise<MilestoneList> {
    const res = await listing(token, { from, to }).expect(200);
    return res.body as MilestoneList;
  }

  /** Creates a Milestone, a second later than the one before. */
  async function plan(
    token: string,
    date: string,
    title: string,
  ): Promise<Milestone> {
    await running.clock.advance(1000);
    const res = await create(token, { title, date }).expect(201);
    return res.body as Milestone;
  }

  it('creates a Milestone, trimmed and not done', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      title: '  3-bet fuera de posición ',
      description: ' Botes 3-bet desde la BB. \n',
      date: '2026-11-10',
    }).expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      title: '3-bet fuera de posición',
      description: 'Botes 3-bet desde la BB.',
      date: '2026-11-10',
      done: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await list(account.token, '2026-11-10', '2026-11-10')).toEqual({
      milestones: [created.body],
      hasAny: true,
    });
  });

  it('leaves the description empty when none is sent', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, {
      title: 'Squeeze',
      date: '2026-11-10',
    }).expect(201);

    expect(created.body).toMatchObject({ title: 'Squeeze', description: '' });
  });

  it('lists the span with both ends included, by date then creation', async () => {
    const account = await newAccount(running.httpServer);
    await plan(account.token, '2026-10-31', 'Before');
    const late = await plan(account.token, '2026-11-30', 'Last day');
    await plan(account.token, '2026-11-01', 'First day, planned first');
    await plan(account.token, '2026-11-15', 'Middle');
    await plan(account.token, '2026-12-01', 'After');
    await plan(account.token, '2026-11-01', 'First day, planned second');
    await plan(account.token, '2026-11-01', 'First day, planned third');

    const { milestones } = await list(
      account.token,
      '2026-11-01',
      '2026-11-30',
    );

    expect(milestones.map(({ title }) => title)).toEqual([
      'First day, planned first',
      'First day, planned second',
      'First day, planned third',
      'Middle',
      late.title,
    ]);
  });

  it('says whether the Account has any Milestone at all', async () => {
    const account = await newAccount(running.httpServer);

    expect(await list(account.token, '2026-11-01', '2026-11-30')).toEqual({
      milestones: [],
      hasAny: false,
    });

    await plan(account.token, '2027-05-04', 'Far away');

    expect(await list(account.token, '2026-11-01', '2026-11-30')).toEqual({
      milestones: [],
      hasAny: true,
    });
  });

  it('refuses a title that is empty or too long', async () => {
    const account = await newAccount(running.httpServer);

    for (const title of [undefined, '', '   ', 42, 'x'.repeat(81)]) {
      const res = await create(account.token, { title, date: '2026-11-10' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ reason: 'invalid-milestone-title' });
    }
    await create(account.token, {
      title: ` ${'x'.repeat(80)} `,
      date: '2026-11-10',
    }).expect(201);
  });

  it('refuses a description that is too long or not text', async () => {
    const account = await newAccount(running.httpServer);

    for (const description of ['x'.repeat(501), 7, null]) {
      const res = await create(account.token, {
        title: 'Squeeze',
        description,
        date: '2026-11-10',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ reason: 'invalid-milestone-description' });
    }
    await create(account.token, {
      title: 'Squeeze',
      description: ` ${'x'.repeat(500)} `,
      date: '2026-11-10',
    }).expect(201);
  });

  it("refuses a date that isn't a real calendar date", async () => {
    const account = await newAccount(running.httpServer);

    for (const date of [
      undefined,
      '',
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-11-1',
      '10/11/2026',
      '2026-11-10T00:00:00Z',
      20261110,
    ]) {
      const res = await create(account.token, { title: 'Squeeze', date });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ reason: 'invalid-milestone-date' });
    }
    const leap = await create(account.token, {
      title: 'Squeeze',
      date: '2028-02-29',
    }).expect(201);
    expect(leap.body).toMatchObject({ date: '2028-02-29' });
  });

  it('refuses a missing, invalid, backwards or too long span', async () => {
    const account = await newAccount(running.httpServer);

    for (const query of [
      {},
      { from: '2026-11-01' },
      { to: '2026-11-30' },
      { from: '2026-11-01', to: '2026-11-31' },
      { from: 'yesterday', to: '2026-11-30' },
      { from: '2026-11-30', to: '2026-11-01' },
      // 63 days, both ends counted.
      { from: '2026-11-01', to: '2027-01-02' },
    ]) {
      const res = await listing(account.token, query);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ reason: 'invalid-calendar-span' });
    }
    // 62 days, both ends counted.
    await listing(account.token, {
      from: '2026-11-01',
      to: '2027-01-01',
    }).expect(200);
  });

  it("never lists another Account's Milestones", async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    await plan(owner.token, '2026-11-10', 'Mine');

    expect(await list(stranger.token, '2026-11-01', '2026-11-30')).toEqual({
      milestones: [],
      hasAny: false,
    });
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
    const span = { from: '2026-11-01', to: '2026-11-30' };
    const body = { title: 'Squeeze', date: '2026-11-10' };

    for (const res of [await listing(token, span), await create(token, body)]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ reason: 'account-required' });
    }
    for (const res of [
      await request(running.httpServer)
        .get('/api/calendar/milestones')
        .query(span),
      await request(running.httpServer)
        .post('/api/calendar/milestones')
        .send(body),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ reason: 'unauthenticated' });
    }
  });
});
