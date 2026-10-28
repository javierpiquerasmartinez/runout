import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface LabTag {
  id: string;
  name: string;
  ranges: number;
}

interface Range {
  id: string;
  name: string;
  combos: Record<string, number>;
  tags: { id: string; name: string }[];
}

describe('Tags in the Lab (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function createTag(token: string, name: unknown) {
    return request(running.httpServer)
      .post('/api/lab/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
  }

  async function tagsOf(token: string): Promise<LabTag[]> {
    const res = await request(running.httpServer)
      .get('/api/lab/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LabTag[];
  }

  function createRange(token: string, body: object) {
    return request(running.httpServer)
      .post('/api/lab/ranges')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function saveRange(token: string, id: string, body: object) {
    return request(running.httpServer)
      .put(`/api/lab/ranges/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function readRange(token: string, id: string): Promise<Range> {
    const res = await request(running.httpServer)
      .get(`/api/lab/ranges/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as Range;
  }

  async function rangesOf(
    token: string,
  ): Promise<{ name: string; tags: Range['tags'] }[]> {
    const res = await request(running.httpServer)
      .get('/api/lab/ranges')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as Range[]).map(({ name, tags }) => ({ name, tags }));
  }

  async function newTag(token: string, name: string): Promise<LabTag> {
    return (await createTag(token, name).expect(201)).body as LabTag;
  }

  it('creates Tags, listed by name with how many Ranges carry each', async () => {
    const account = await newAccount(running.httpServer);

    const created = await createTag(account.token, '  OR ').expect(201);
    await createTag(account.token, 'btn').expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'OR',
      ranges: 0,
    });
    expect(await tagsOf(account.token)).toEqual([
      { id: expect.any(String), name: 'btn', ranges: 0 },
      { id: created.body.id, name: 'OR', ranges: 0 },
    ]);
  });

  it('puts Tags on a Range when it is saved, and returns them wherever the Range is read', async () => {
    const account = await newAccount(running.httpServer);
    const or = await newTag(account.token, 'OR');
    const btn = await newTag(account.token, 'btn');

    const created = await createRange(account.token, {
      name: 'OR BTN',
      combos: { AsKs: 100 },
      tagIds: [or.id, btn.id, or.id],
    }).expect(201);
    const { id } = created.body as Range;
    await createRange(account.token, {
      name: 'OR CO',
      combos: {},
      tagIds: [or.id],
    }).expect(201);

    // Sorted by name, ignoring case.
    const both = [
      { id: btn.id, name: 'btn' },
      { id: or.id, name: 'OR' },
    ];
    expect((created.body as Range).tags).toEqual(both);
    expect((await readRange(account.token, id)).tags).toEqual(both);
    expect(await rangesOf(account.token)).toEqual([
      { name: 'OR BTN', tags: both },
      { name: 'OR CO', tags: [{ id: or.id, name: 'OR' }] },
    ]);
    expect(await tagsOf(account.token)).toEqual([
      { ...btn, ranges: 1 },
      { ...or, ranges: 2 },
    ]);

    // Saving replaces the Tags with those sent; none sent is none.
    const saved = await saveRange(account.token, id, {
      name: 'OR BTN',
      combos: { AsKs: 100 },
      tagIds: [btn.id],
    }).expect(200);
    expect((saved.body as Range).tags).toEqual([{ id: btn.id, name: 'btn' }]);
    await saveRange(account.token, id, { name: 'OR BTN', combos: {} }).expect(
      200,
    );
    expect((await readRange(account.token, id)).tags).toEqual([]);
  });

  function renameTag(token: string, id: string, name: unknown) {
    return request(running.httpServer)
      .patch(`/api/lab/tags/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
  }

  function deleteTag(token: string, id: string) {
    return request(running.httpServer)
      .delete(`/api/lab/tags/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('renames a Tag on every Range that carries it', async () => {
    const account = await newAccount(running.httpServer);
    const tag = await newTag(account.token, 'OR');
    const { id } = (
      await createRange(account.token, {
        name: 'OR BTN',
        combos: {},
        tagIds: [tag.id],
      })
    ).body as Range;

    const renamed = await renameTag(account.token, tag.id, ' Open ').expect(
      200,
    );

    expect(renamed.body).toEqual({ id: tag.id, name: 'Open', ranges: 1 });
    expect((await readRange(account.token, id)).tags).toEqual([
      { id: tag.id, name: 'Open' },
    ]);
  });

  it('deletes a Tag, taking it off every Range and leaving the Ranges as they were', async () => {
    const account = await newAccount(running.httpServer);
    const or = await newTag(account.token, 'OR');
    const btn = await newTag(account.token, 'BTN');
    const { id } = (
      await createRange(account.token, {
        name: 'OR BTN',
        combos: { AsKs: 100 },
        tagIds: [or.id, btn.id],
      })
    ).body as Range;

    await deleteTag(account.token, or.id).expect(204);

    expect(await readRange(account.token, id)).toEqual({
      id,
      name: 'OR BTN',
      combos: { AsKs: 100 },
      tags: [{ id: btn.id, name: 'BTN' }],
    });
    expect(await tagsOf(account.token)).toEqual([{ ...btn, ranges: 1 }]);
    expect((await deleteTag(account.token, or.id)).status).toBe(404);
    // Its name is free again.
    await createTag(account.token, 'or').expect(201);
  });

  it('keeps names unique per Account ignoring case, and refuses bad names', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    await newTag(javier.token, 'OR');
    const btn = await newTag(javier.token, 'BTN');

    const taken = await createTag(javier.token, ' or ').expect(409);
    const clash = await renameTag(javier.token, btn.id, 'OR').expect(409);

    expect(taken.body).toEqual({ reason: 'tag-name-taken' });
    expect(clash.body).toEqual({ reason: 'tag-name-taken' });
    // Its own name in another case is no clash.
    await renameTag(javier.token, btn.id, 'btn').expect(200);
    await newTag(marta.token, 'OR');
    for (const name of ['', '   ', 'x'.repeat(41), 7, undefined]) {
      expect((await createTag(javier.token, name)).body).toEqual({
        reason: 'invalid-tag-name',
      });
      expect((await renameTag(javier.token, btn.id, name)).status).toBe(400);
    }
  });

  it('copies the Tags when a Range is duplicated', async () => {
    const account = await newAccount(running.httpServer);
    const or = await newTag(account.token, 'OR');
    const { id } = (
      await createRange(account.token, {
        name: 'OR BTN',
        combos: {},
        tagIds: [or.id],
      })
    ).body as Range;

    const copy = await request(running.httpServer)
      .post(`/api/lab/ranges/${id}/copies`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(201);

    expect((copy.body as Range).tags).toEqual([{ id: or.id, name: 'OR' }]);
    expect((await tagsOf(account.token))[0].ranges).toBe(2);
  });

  it("never mixes the Lab's Tags with the Library's, either way", async () => {
    const account = await newAccount(running.httpServer);
    const library = await request(running.httpServer)
      .post('/api/library/tags')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'bluff catch' })
      .expect(201);
    const lab = await newTag(account.token, '3B');

    expect(await tagsOf(account.token)).toEqual([{ ...lab, ranges: 0 }]);
    const hands = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);
    expect(hands.body.options.tags).toEqual([
      { id: library.body.id, name: 'bluff catch', hands: 0 },
    ]);
    // The same name may be in both sets.
    await createTag(account.token, 'bluff catch').expect(201);
    // Neither set's ids reach the other.
    const libraryId = library.body.id as string;
    expect(
      (
        await createRange(account.token, {
          name: 'OR',
          combos: {},
          tagIds: [libraryId],
        })
      ).body,
    ).toEqual({ reason: 'tag-not-found' });
    expect((await renameTag(account.token, libraryId, 'x')).status).toBe(404);
    expect((await deleteTag(account.token, libraryId)).status).toBe(404);
    await request(running.httpServer)
      .patch(`/api/library/tags/${lab.id}`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'x' })
      .expect(404);
    await request(running.httpServer)
      .delete(`/api/library/tags/${lab.id}`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(404);
  });

  it('refuses Tag ids that are not a list of text, as a whole', async () => {
    const account = await newAccount(running.httpServer);
    const tag = await newTag(account.token, 'OR');
    const { id } = (
      await createRange(account.token, { name: 'OR', combos: {} })
    ).body as Range;

    for (const tagIds of [tag.id, [tag.id, 7], { id: tag.id }, null]) {
      const created = await createRange(account.token, {
        name: 'New',
        combos: {},
        tagIds,
      });
      expect(created.status).toBe(400);
      expect(created.body).toEqual({ reason: 'invalid-range-tags' });
      const saved = await saveRange(account.token, id, {
        name: 'OR',
        combos: {},
        tagIds,
      });
      expect(saved.body).toEqual({ reason: 'invalid-range-tags' });
    }
    expect((await rangesOf(account.token)).map(({ name }) => name)).toEqual([
      'OR',
    ]);
  });

  it("answers 404 for a Tag that isn't the caller's, and keeps it off their Ranges", async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const tag = await newTag(owner.token, 'OR');
    const theirs = await newTag(stranger.token, 'Mine');
    const { id } = (
      await createRange(stranger.token, {
        name: 'Mine',
        combos: {},
        tagIds: [theirs.id],
      })
    ).body as Range;

    for (const res of [
      await renameTag(stranger.token, tag.id, 'Stolen'),
      await deleteTag(stranger.token, tag.id),
      await renameTag(owner.token, 'not-a-uuid', 'x'),
      await deleteTag(owner.token, 'not-a-uuid'),
      await createRange(stranger.token, {
        name: 'Other',
        combos: {},
        tagIds: [tag.id],
      }),
      // One Tag not theirs and none goes on.
      await saveRange(stranger.token, id, {
        name: 'Mine',
        combos: {},
        tagIds: [tag.id],
      }),
      await saveRange(stranger.token, id, {
        name: 'Mine',
        combos: {},
        tagIds: ['not-a-uuid'],
      }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'tag-not-found' });
    }
    expect(await tagsOf(stranger.token)).toEqual([{ ...theirs, ranges: 1 }]);
    expect(await tagsOf(owner.token)).toEqual([{ ...tag, ranges: 0 }]);
    expect((await readRange(stranger.token, id)).tags).toEqual([
      { id: theirs.id, name: 'Mine' },
    ]);
  });

  it('refuses anyone without an Account', async () => {
    const master = await newAccount(running.httpServer);
    const tag = await newTag(master.token, 'OR');
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
        .get('/api/lab/tags')
        .set('Authorization', `Bearer ${token}`),
      await createTag(token, 'Mine'),
      await renameTag(token, tag.id, 'Mine'),
      await deleteTag(token, tag.id),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ reason: 'account-required' });
    }
    for (const res of [
      await request(running.httpServer).get('/api/lab/tags'),
      await request(running.httpServer)
        .post('/api/lab/tags')
        .send({ name: 'Mine' }),
      await request(running.httpServer)
        .patch(`/api/lab/tags/${tag.id}`)
        .send({ name: 'Mine' }),
      await request(running.httpServer).delete(`/api/lab/tags/${tag.id}`),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ reason: 'unauthenticated' });
    }
  });
});
