import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Tag {
  id: string;
  name: string;
  hands: number;
}

interface LibraryPage {
  total: number;
  hands: { id: string; site: string; tags: { id: string; name: string }[] }[];
  options: { tags: Tag[] };
}

describe('Tags in the Library (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  async function importText(token: string, text: string): Promise<void> {
    const preview = await request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${token}`)
      .send({ text })
      .expect(201);
    await request(running.httpServer)
      .post('/api/library/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ previews: [preview.body.id as string] })
      .expect(201);
  }

  async function list(token: string, query: string = ''): Promise<LibraryPage> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LibraryPage;
  }

  function create(token: string, name: unknown) {
    return request(running.httpServer)
      .post('/api/library/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
  }

  it('creates Tags, offered in the list sorted by name', async () => {
    const account = await newAccount(running.httpServer);

    const created = await create(account.token, '  Multiway ').expect(201);
    await create(account.token, 'botes 3-bet').expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Multiway',
      hands: 0,
    });
    expect((await list(account.token)).options.tags).toEqual([
      { id: expect.any(String), name: 'botes 3-bet', hands: 0 },
      { id: created.body.id, name: 'Multiway', hands: 0 },
    ]);
  });

  it('keeps names unique per Account, ignoring case', async () => {
    const javier = await newAccount(running.httpServer);
    const marta = await newAccount(running.httpServer);
    await create(javier.token, 'Multiway').expect(201);

    const taken = await create(javier.token, 'MULTIWAY ').expect(409);

    expect(taken.body).toEqual({ reason: 'tag-name-taken' });
    // Another Account's Tags are its own business.
    await create(marta.token, 'multiway').expect(201);
  });

  it('refuses a name that is empty, too long or not text', async () => {
    const account = await newAccount(running.httpServer);

    for (const name of ['', '   ', 'x'.repeat(41), 7, undefined]) {
      const res = await create(account.token, name).expect(400);
      expect(res.body).toEqual({ reason: 'invalid-tag-name' });
    }
    await create(account.token, 'x'.repeat(40)).expect(201);
  });

  it('renames a Tag, even to another case of its own name', async () => {
    const account = await newAccount(running.httpServer);
    const tag = (await create(account.token, 'multiway').expect(201))
      .body as Tag;
    await create(account.token, 'All-in').expect(201);

    const renamed = await rename(account.token, tag.id, 'Multiway').expect(200);
    const clash = await rename(account.token, tag.id, 'all-in').expect(409);

    expect(renamed.body).toEqual({ id: tag.id, name: 'Multiway', hands: 0 });
    expect(clash.body).toEqual({ reason: 'tag-name-taken' });
    expect(
      (await list(account.token)).options.tags.map((each) => each.name),
    ).toEqual(['All-in', 'Multiway']);
  });

  it('deletes a Tag', async () => {
    const account = await newAccount(running.httpServer);
    const tag = (await create(account.token, 'Multiway').expect(201))
      .body as Tag;

    await remove(account.token, tag.id).expect(204);

    expect((await list(account.token)).options.tags).toEqual([]);
    // Its name is free again.
    await create(account.token, 'multiway').expect(201);
  });

  it('renames and deletes only the Account’s own Tags', async () => {
    const owner = await newAccount(running.httpServer);
    const stranger = await newAccount(running.httpServer);
    const tag = (await create(owner.token, 'Multiway').expect(201)).body as Tag;

    for (const res of [
      await rename(stranger.token, tag.id, 'Mine'),
      await remove(stranger.token, tag.id),
      await remove(owner.token, 'not-a-uuid'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ reason: 'tag-not-found' });
    }
    expect((await list(owner.token)).options.tags).toEqual([tag]);
  });

  describe('on Hands', () => {
    /** An Account whose Library holds the four PokerStars Hands of `pokerstars-session.txt`. */
    async function stockedAccount() {
      const account = await newAccount(running.httpServer);
      await importText(
        account.token,
        freshHandHistory('pokerstars-session.txt'),
      );
      return account;
    }

    it('attaches a Tag to several Hands and detaches it, with the rows and counts following', async () => {
      const account = await stockedAccount();
      const [first, second, third] = (await list(account.token)).hands;
      const multiway = (await create(account.token, 'Multiway')).body as Tag;
      const allIn = (await create(account.token, 'All-in')).body as Tag;

      const attached = await attach(account.token, multiway.id, [
        first.id,
        second.id,
        third.id,
      ]).expect(200);
      await attach(account.token, allIn.id, [first.id]).expect(200);
      // Attaching again changes nothing.
      await attach(account.token, allIn.id, [first.id]).expect(200);
      expect(attached.body).toEqual({
        tagId: multiway.id,
        handIds: [first.id, second.id, third.id],
        attached: true,
      });

      const detached = await detach(account.token, multiway.id, [
        second.id,
      ]).expect(200);
      expect(detached.body).toEqual({
        tagId: multiway.id,
        handIds: [second.id],
        attached: false,
      });

      const page = await list(account.token);
      const tagsOf = (id: string) =>
        page.hands.find((hand) => hand.id === id)?.tags;
      // Each row's Tags, sorted by name.
      expect(tagsOf(first.id)).toEqual([
        { id: allIn.id, name: 'All-in' },
        { id: multiway.id, name: 'Multiway' },
      ]);
      expect(tagsOf(second.id)).toEqual([]);
      expect(tagsOf(third.id)).toEqual([{ id: multiway.id, name: 'Multiway' }]);
      expect(page.options.tags).toEqual([
        { ...allIn, hands: 1 },
        { ...multiway, hands: 2 },
      ]);
    });

    it('takes a deleted Tag off its Hands', async () => {
      const account = await stockedAccount();
      const [hand] = (await list(account.token)).hands;
      const tag = (await create(account.token, 'Multiway')).body as Tag;
      await attach(account.token, tag.id, [hand.id]).expect(200);

      await remove(account.token, tag.id).expect(204);

      expect((await list(account.token)).hands[0].tags).toEqual([]);
    });

    it('tags only Hands in the Account’s own Library, or none of them', async () => {
      const owner = await stockedAccount();
      const stranger = await stockedAccount();
      const [mine] = (await list(owner.token)).hands;
      const [theirs] = (await list(stranger.token)).hands;
      const tag = (await create(owner.token, 'Multiway')).body as Tag;

      for (const handIds of [[mine.id, theirs.id], ['not-a-uuid']]) {
        const res = await attach(owner.token, tag.id, handIds).expect(404);
        expect(res.body).toEqual({ reason: 'hand-not-found' });
      }
      expect((await list(owner.token)).options.tags).toEqual([tag]);
      for (const handIds of [[], 'all', [7], undefined]) {
        const res = await attach(owner.token, tag.id, handIds).expect(400);
        expect(res.body).toEqual({ reason: 'invalid-tag-hands' });
      }
      const foreign = await attach(stranger.token, tag.id, [theirs.id]);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ reason: 'tag-not-found' });
    });

    it('filters the list and the Results by any of several Tags', async () => {
      const account = await stockedAccount();
      const [first, second, third, fourth] = (await list(account.token)).hands;
      const multiway = (await create(account.token, 'Multiway')).body as Tag;
      const allIn = (await create(account.token, 'All-in')).body as Tag;
      const unused = (await create(account.token, 'Unused')).body as Tag;
      await attach(account.token, multiway.id, [first.id, second.id]);
      await attach(account.token, allIn.id, [second.id, third.id]);
      await request(running.httpServer)
        .put(`/api/library/hands/${third.id}/mark`)
        .set('Authorization', `Bearer ${account.token}`)
        .expect(200);
      const handsOf = async (query: string) =>
        (await list(account.token, query)).hands.map((hand) => hand.id);
      const resultsOf = async (query: string) =>
        (
          await request(running.httpServer)
            .get(`/api/library/results?${query}`)
            .set('Authorization', `Bearer ${account.token}`)
            .expect(200)
        ).body as { hands: number };

      expect(await handsOf(`tag=${multiway.id}`)).toEqual([
        first.id,
        second.id,
      ]);
      expect(await handsOf(`tag=${multiway.id}&tag=${allIn.id}`)).toEqual([
        first.id,
        second.id,
        third.id,
      ]);
      expect(await handsOf(`tag=${allIn.id}&marked=true`)).toEqual([third.id]);
      expect(await handsOf(`tag=${unused.id}`)).toEqual([]);
      expect(await handsOf('')).toContain(fourth.id);
      expect((await resultsOf(`tag=${multiway.id}`)).hands).toBe(2);
      expect(
        (await resultsOf(`tag=${multiway.id}&tag=${allIn.id}`)).hands,
      ).toBe(3);
    });

    it('refuses a Tag filter it cannot read', async () => {
      const account = await newAccount(running.httpServer);

      const res = await request(running.httpServer)
        .get('/api/library/hands?tag=Multiway')
        .set('Authorization', `Bearer ${account.token}`)
        .expect(400);

      expect(res.body).toEqual({ reason: 'invalid-library-filter' });
    });

    it('never shows an Account’s Tags to another one with the same Hand', async () => {
      const javier = await newAccount(running.httpServer);
      const marta = await newAccount(running.httpServer);
      const text = freshHandHistory('pokerstars-showdown.txt');
      await importText(javier.token, text);
      await importText(marta.token, text);
      const [hand] = (await list(javier.token)).hands;
      const tag = (await create(javier.token, 'Multiway')).body as Tag;
      await attach(javier.token, tag.id, [hand.id]).expect(200);

      const theirs = await list(marta.token);

      expect(theirs.hands.map((each) => each.id)).toEqual([hand.id]);
      expect(theirs.hands[0].tags).toEqual([]);
      expect(theirs.options.tags).toEqual([]);
      expect((await list(marta.token, `tag=${tag.id}`)).total).toBe(0);
    });
  });

  function attach(token: string, tagId: string, handIds: unknown) {
    return request(running.httpServer)
      .put(`/api/library/tags/${tagId}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ handIds });
  }

  function detach(token: string, tagId: string, handIds: unknown) {
    return request(running.httpServer)
      .delete(`/api/library/tags/${tagId}/hands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ handIds });
  }

  function rename(token: string, tagId: string, name: unknown) {
    return request(running.httpServer)
      .patch(`/api/library/tags/${tagId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
  }

  function remove(token: string, tagId: string) {
    return request(running.httpServer)
      .delete(`/api/library/tags/${tagId}`)
      .set('Authorization', `Bearer ${token}`);
  }
});
