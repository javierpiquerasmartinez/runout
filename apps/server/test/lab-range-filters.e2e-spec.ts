import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

describe('Finding Ranges in the Lab (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  async function createTag(token: string, name: string): Promise<string> {
    const res = await request(running.httpServer)
      .post('/api/lab/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  async function createRange(
    token: string,
    name: string,
    tagIds: string[] = [],
  ): Promise<void> {
    await request(running.httpServer)
      .post('/api/lab/ranges')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, combos: {}, tagIds })
      .expect(201);
  }

  function list(token: string, query: string) {
    return request(running.httpServer)
      .get(`/api/lab/ranges?${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function namesListed(token: string, query: string): Promise<string[]> {
    const res = await list(token, query).expect(200);
    return (res.body as { name: string }[]).map(({ name }) => name);
  }

  it('keeps the Ranges carrying any of the Tags chosen', async () => {
    const { token } = await newAccount(running.httpServer);
    const or = await createTag(token, 'OR');
    const threeBet = await createTag(token, '3B');
    const btn = await createTag(token, 'BTN');
    await createRange(token, 'OR BTN', [or, btn]);
    await createRange(token, 'OR CO', [or]);
    await createRange(token, '3B BB vs CO', [threeBet]);
    await createRange(token, 'Untagged');

    expect(await namesListed(token, `tag=${btn}`)).toEqual(['OR BTN']);
    expect(await namesListed(token, `tag=${or}`)).toEqual(['OR BTN', 'OR CO']);
    expect(await namesListed(token, `tag=${btn}&tag=${threeBet}`)).toEqual([
      '3B BB vs CO',
      'OR BTN',
    ]);
  });

  it('searches the names, ignoring case and spaces around the search, and taking every character as written', async () => {
    const { token } = await newAccount(running.httpServer);
    await createRange(token, '3B BB vs CO');
    await createRange(token, 'OR BTN vs BB');
    await createRange(token, 'OR CO');
    await createRange(token, 'Call 50% BB');
    await createRange(token, 'Call_BB');

    expect(await namesListed(token, 'search=bb')).toEqual([
      '3B BB vs CO',
      'Call 50% BB',
      'Call_BB',
      'OR BTN vs BB',
    ]);
    expect(await namesListed(token, 'search=%20vs%20%20')).toEqual([
      '3B BB vs CO',
      'OR BTN vs BB',
    ]);
    expect(await namesListed(token, 'search=50%25')).toEqual(['Call 50% BB']);
    expect(await namesListed(token, 'search=l_')).toEqual(['Call_BB']);
    expect(await namesListed(token, 'search=SB')).toEqual([]);
    expect(await namesListed(token, 'search=')).toHaveLength(5);
  });

  it('combines the search with the Tags', async () => {
    const { token } = await newAccount(running.httpServer);
    const threeBet = await createTag(token, '3B');
    const or = await createTag(token, 'OR');
    await createRange(token, '3B BB vs CO', [threeBet]);
    await createRange(token, '3B SB vs BTN', [threeBet]);
    await createRange(token, 'OR BTN vs BB', [or]);

    expect(await namesListed(token, `tag=${threeBet}&search=bb`)).toEqual([
      '3B BB vs CO',
    ]);
    expect(await namesListed(token, `tag=${or}&search=sb`)).toEqual([]);
  });

  it("matches nothing with another Account's Tag", async () => {
    const owner = await newAccount(running.httpServer);
    const other = await newAccount(running.httpServer);
    const theirs = await createTag(owner.token, 'OR');
    await createRange(owner.token, 'OR BTN', [theirs]);
    await createRange(other.token, 'OR CO');

    expect(await namesListed(other.token, `tag=${theirs}`)).toEqual([]);
  });

  it('refuses a filter it cannot read', async () => {
    const { token } = await newAccount(running.httpServer);
    for (const query of ['tag=not-an-id', 'tag=', 'search=a&search=b']) {
      const res = await list(token, query).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-range-filter' });
    }
  });
});
