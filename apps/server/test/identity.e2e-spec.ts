import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

describe('Bearer tokens (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  it('recognises an anonymous identity by the token joining its Room gave it', async () => {
    const master = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL50', displayName: 'Javier' });
    const issued = await request(running.httpServer)
      .post(`/api/rooms/${room.body.code}/guests`)
      .send({ displayName: 'Marta' });

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
