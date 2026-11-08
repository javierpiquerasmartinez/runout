import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
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

  function change(token: string, id: string, body: object) {
    return request(running.httpServer)
      .patch(`/api/calendar/milestones/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function reading(token: string, id: string) {
    return request(running.httpServer)
      .get(`/api/calendar/milestones/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function deleting(token: string, id: string) {
    return request(running.httpServer)
      .delete(`/api/calendar/milestones/${id}`)
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
    });
  });

  it('marks a Milestone done and not done', async () => {
    const account = await newAccount(running.httpServer);
    const squeeze = await plan(account.token, '2026-11-10', 'Squeeze');

    const done = await change(account.token, squeeze.id, { done: true }).expect(
      200,
    );
    expect(done.body).toEqual({ ...squeeze, done: true });
    expect(await list(account.token, '2026-11-10', '2026-11-10')).toEqual({
      milestones: [{ ...squeeze, done: true }],
    });

    const undone = await change(account.token, squeeze.id, {
      done: false,
    }).expect(200);
    expect(undone.body).toEqual(squeeze);
  });

  it('changes the title, description and date, keeping what is left out', async () => {
    const account = await newAccount(running.httpServer);
    const squeeze = await plan(account.token, '2026-11-10', 'Squeeze');

    const changed = await change(account.token, squeeze.id, {
      title: '  Squeeze vs BTN ',
      description: ' Desde la BB. ',
      date: '2026-11-12',
    }).expect(200);

    expect(changed.body).toEqual({
      ...squeeze,
      title: 'Squeeze vs BTN',
      description: 'Desde la BB.',
      date: '2026-11-12',
    });
    const { milestones } = await list(
      account.token,
      '2026-11-10',
      '2026-11-12',
    );
    expect(milestones).toEqual([changed.body]);

    const cleared = await change(account.token, squeeze.id, {
      description: '',
    }).expect(200);
    expect(cleared.body).toEqual({ ...changed.body, description: '' });
  });

  it('lists the pending Milestones of a day before the done ones, each by creation', async () => {
    const account = await newAccount(running.httpServer);
    const first = await plan(account.token, '2026-11-10', 'First');
    await plan(account.token, '2026-11-10', 'Second');
    const third = await plan(account.token, '2026-11-10', 'Third');
    await plan(account.token, '2026-11-10', 'Fourth');
    await plan(account.token, '2026-11-11', 'Next day');
    await change(account.token, third.id, { done: true }).expect(200);
    await change(account.token, first.id, { done: true }).expect(200);

    const { milestones } = await list(
      account.token,
      '2026-11-10',
      '2026-11-11',
    );

    expect(milestones.map(({ title, done }) => [title, done])).toEqual([
      ['Second', false],
      ['Fourth', false],
      ['First', true],
      ['Third', true],
      ['Next day', false],
    ]);
  });

  it('refuses a change with the same rules as creating', async () => {
    const account = await newAccount(running.httpServer);
    const squeeze = await plan(account.token, '2026-11-10', 'Squeeze');

    for (const [body, reason] of [
      [{ title: '' }, 'invalid-milestone-title'],
      [{ title: '   ' }, 'invalid-milestone-title'],
      [{ title: null }, 'invalid-milestone-title'],
      [{ title: 'x'.repeat(81) }, 'invalid-milestone-title'],
      [{ description: 'x'.repeat(501) }, 'invalid-milestone-description'],
      [{ description: null }, 'invalid-milestone-description'],
      [{ date: '2026-02-30' }, 'invalid-milestone-date'],
      [{ date: null }, 'invalid-milestone-date'],
      [{ done: 'yes' }, 'invalid-milestone-done'],
      [{ done: null }, 'invalid-milestone-done'],
      [{ done: 1 }, 'invalid-milestone-done'],
      [{ done: true, title: '' }, 'invalid-milestone-title'],
    ] as const) {
      const res = await change(account.token, squeeze.id, body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ reason });
    }
    expect(await list(account.token, '2026-11-10', '2026-11-10')).toEqual({
      milestones: [squeeze],
    });
  });

  it("tells another Account a Milestone of someone else's is not there", async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const mine = await plan(owner.token, '2026-11-10', 'Mine');

    for (const [id, body] of [
      [mine.id, { done: true }],
      // Not being there wins over a refused body.
      [mine.id, { title: '' }],
      ['not-a-uuid', { done: true }],
      ['5b0c6a2e-8f6d-4f43-9a52-3c1c4b3f8d11', { done: true }],
    ] as const) {
      const res = await change(stranger.token, id, body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'milestone-not-found' });
    }
    expect(await list(owner.token, '2026-11-10', '2026-11-10')).toEqual({
      milestones: [mine],
    });
  });

  it('reads one Milestone', async () => {
    const account = await newAccount(running.httpServer);
    const planned = await plan(account.token, '2026-11-10', 'Squeeze');

    const res = await reading(account.token, planned.id).expect(200);

    expect(res.body).toEqual(planned);
  });

  it('deletes a Milestone, which is then not there', async () => {
    const account = await newAccount(running.httpServer);
    const doomed = await plan(account.token, '2026-11-10', 'Squeeze');
    const kept = await plan(account.token, '2026-11-10', 'Float');

    await deleting(account.token, doomed.id).expect(204);

    for (const res of [
      await reading(account.token, doomed.id),
      await deleting(account.token, doomed.id),
      await change(account.token, doomed.id, { done: true }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'milestone-not-found' });
    }
    expect(await list(account.token, '2026-11-10', '2026-11-10')).toEqual({
      milestones: [kept],
    });
  });

  it("neither reads nor deletes another Account's Milestone", async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const mine = await plan(owner.token, '2026-11-10', 'Mine');

    for (const id of [
      mine.id,
      'not-a-uuid',
      '5b0c6a2e-8f6d-4f43-9a52-3c1c4b3f8d11',
    ]) {
      for (const res of [
        await reading(stranger.token, id),
        await deleting(stranger.token, id),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ reason: 'milestone-not-found' });
      }
    }
    await reading(owner.token, mine.id).expect(200);
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

    const mine = await plan(master.token, '2026-11-10', 'Mine');

    for (const res of [
      await listing(token, span),
      await create(token, body),
      await change(token, mine.id, { done: true }),
      await reading(token, mine.id),
      await deleting(token, mine.id),
    ]) {
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
      await request(running.httpServer)
        .patch(`/api/calendar/milestones/${mine.id}`)
        .send({ done: true }),
      await request(running.httpServer).get(
        `/api/calendar/milestones/${mine.id}`,
      ),
      await request(running.httpServer).delete(
        `/api/calendar/milestones/${mine.id}`,
      ),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ reason: 'unauthenticated' });
    }
  });
});

describe('Milestones during Impersonation (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
  });

  afterEach(async () => {
    await running.close();
  });

  it('lets an Administrator impersonating an Account read, change and delete its Milestones', async () => {
    const administrator = await signInAdministrator(running);
    const ana = await invitedAccount(
      running,
      administrator.token,
      uniqueEmail('ana'),
    );
    const as = (token: string) => ({
      get: (path: string) =>
        request(running.httpServer)
          .get(`/api${path}`)
          .set('Authorization', `Bearer ${token}`),
      post: (path: string) =>
        request(running.httpServer)
          .post(`/api${path}`)
          .set('Authorization', `Bearer ${token}`),
      patch: (path: string) =>
        request(running.httpServer)
          .patch(`/api${path}`)
          .set('Authorization', `Bearer ${token}`),
      delete: (path: string) =>
        request(running.httpServer)
          .delete(`/api${path}`)
          .set('Authorization', `Bearer ${token}`),
    });
    const kept = await as(ana.token)
      .post('/calendar/milestones')
      .send({ title: 'Squeeze', date: '2026-11-10' })
      .expect(201);
    const doomed = await as(ana.token)
      .post('/calendar/milestones')
      .send({ title: 'Float', date: '2026-11-11' })
      .expect(201);
    const impersonation = await as(administrator.token)
      .post(`/admin/accounts/${ana.id}/impersonations`)
      .expect(201);
    const token = impersonation.body.token as string;

    const read = await as(token)
      .get(`/calendar/milestones/${kept.body.id as string}`)
      .expect(200);
    expect(read.body).toEqual(kept.body);
    await as(token)
      .patch(`/calendar/milestones/${kept.body.id as string}`)
      .send({ title: 'Squeeze vs BTN', done: true })
      .expect(200);
    await as(token)
      .delete(`/calendar/milestones/${doomed.body.id as string}`)
      .expect(204);

    const list = await as(ana.token)
      .get('/calendar/milestones')
      .query({ from: '2026-11-01', to: '2026-11-30' })
      .expect(200);
    expect(list.body).toEqual({
      milestones: [{ ...kept.body, title: 'Squeeze vs BTN', done: true }],
    });
  });
});
