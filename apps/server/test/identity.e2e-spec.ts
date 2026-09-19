import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';

describe('Anonymous identity (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  it('issues an identity with a token on the first visit, with no registration', async () => {
    const res = await request(running.httpServer)
      .post('/api/identities')
      .expect(201);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.token.length).toBeGreaterThanOrEqual(32);
    expect(res.body.identity).toEqual({
      id: expect.any(String),
      displayName: null,
    });
  });

  it('recognises a later visit that presents the token', async () => {
    const issued = await request(running.httpServer).post('/api/identities');

    const res = await request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${issued.body.token}`)
      .expect(200);

    expect(res.body).toEqual(issued.body.identity);
  });

  it('rejects an unknown token with a typed reason', async () => {
    const res = await request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);

    expect(res.body).toMatchObject({ reason: 'unauthenticated' });
  });

  it('rejects a request without a token with a typed reason', async () => {
    const res = await request(running.httpServer)
      .get('/api/identities/me')
      .expect(401);

    expect(res.body).toMatchObject({ reason: 'unauthenticated' });
  });
});
