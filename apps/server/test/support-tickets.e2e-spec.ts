import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { endedBulkImport } from './support/bulk-imports.js';

const MINUTE = 60_000;

describe('Support Tickets (e2e)', () => {
  let running: RunningApp;
  let administrator: { token: string; id: string };
  let anaEmail: string;
  let ana: { token: string; id: string };

  beforeEach(async () => {
    running = await startApp({ administratorEmails: [ADMINISTRATOR_EMAIL] });
    administrator = await signInAdministrator(running);
    anaEmail = uniqueEmail('ana');
    ana = await invitedAccount(running, administrator.token, anaEmail);
  });

  afterEach(async () => {
    await running.close();
  });

  const as = (token: string) => ({
    get: (path: string) =>
      request(running.httpServer)
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(running.httpServer)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  async function open(
    token: string,
    subject = 'Una mano sale mal',
    message = 'El héroe es otro jugador.',
  ) {
    const { body } = await as(token)
      .post('/support/tickets')
      .send({ subject, message })
      .expect(201);
    return body as { id: string };
  }

  describe("the Account's side", () => {
    it('opens a Ticket with a subject and a first message, Open, and reads its thread', async () => {
      const opened = await as(ana.token)
        .post('/support/tickets')
        .send({
          subject: '  Una mano sale mal  ',
          message: 'El héroe es otro jugador.',
        })
        .expect(201);

      expect(opened.body).toMatchObject({
        subject: 'Una mano sale mal',
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        messages: [
          {
            from: 'account',
            text: 'El héroe es otro jugador.',
            writtenAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const read = await as(ana.token)
        .get(`/support/tickets/${opened.body.id}`)
        .expect(200);
      expect(read.body).toEqual(opened.body);
    });

    it('lists only its own Tickets, the latest written in on top', async () => {
      const first = await open(ana.token, 'Primera');
      await running.clock.advance(MINUTE);
      const second = await open(ana.token, 'Segunda');
      await running.clock.advance(MINUTE);
      await as(ana.token)
        .post(`/support/tickets/${first.id}/messages`)
        .send({ text: 'Sigue pasando.' })
        .expect(201);
      const bea = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('bea'),
      );
      const beas = await open(bea.token, 'De Bea');

      const { body } = await as(ana.token).get('/support/tickets').expect(200);

      expect(body.tickets).toEqual([
        {
          id: first.id,
          subject: 'Primera',
          status: 'open',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastMessage: {
            from: 'account',
            writtenAt: '2026-01-01T00:02:00.000Z',
          },
        },
        expect.objectContaining({ id: second.id, subject: 'Segunda' }),
      ]);
      await as(ana.token).get(`/support/tickets/${beas.id}`).expect(404, {
        reason: 'support-ticket-not-found',
      });
      await as(ana.token)
        .post(`/support/tickets/${beas.id}/messages`)
        .send({ text: 'Hola' })
        .expect(404, { reason: 'support-ticket-not-found' });
      await as(ana.token)
        .get('/support/tickets/not-a-ticket')
        .expect(404, { reason: 'support-ticket-not-found' });
    });

    it('writes in its Ticket, the thread in the order it was written', async () => {
      const ticket = await open(ana.token);
      await running.clock.advance(MINUTE);

      const { body } = await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Es la mano de las 22:41.' })
        .expect(201);

      expect(
        body.messages.map((message: { text: string }) => message.text),
      ).toEqual(['El héroe es otro jugador.', 'Es la mano de las 22:41.']);
      expect(body.messages[1].writtenAt).toBe('2026-01-01T00:01:00.000Z');
    });

    it('refuses an empty subject, an empty message and one over 4,000 characters', async () => {
      const ticket = await open(ana.token);
      const refusals: [request.Test, string][] = [
        [
          as(ana.token)
            .post('/support/tickets')
            .send({ subject: '   ', message: 'Hola' }),
          'invalid-support-subject',
        ],
        [
          as(ana.token)
            .post('/support/tickets')
            .send({ subject: 'x'.repeat(121), message: 'Hola' }),
          'invalid-support-subject',
        ],
        [
          as(ana.token).post('/support/tickets').send({ subject: 'Hola' }),
          'invalid-support-message',
        ],
        [
          as(ana.token)
            .post('/support/tickets')
            .send({ subject: 'Hola', message: 'x'.repeat(4001) }),
          'invalid-support-message',
        ],
        [
          as(ana.token)
            .post(`/support/tickets/${ticket.id}/messages`)
            .send({ text: '  ' }),
          'invalid-support-message',
        ],
        [
          as(administrator.token)
            .post(`/admin/support/tickets/${ticket.id}/messages`)
            .send({ text: 'x'.repeat(4001) }),
          'invalid-support-message',
        ],
      ];
      for (const [refused, reason] of refusals) {
        await refused.expect(400, { reason });
      }

      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'x'.repeat(4000) })
        .expect(201);
      const { body } = await as(ana.token).get('/support/tickets').expect(200);
      expect(body.tickets).toHaveLength(1);
    });

    it('is refused while Impersonating', async () => {
      const ticket = await open(ana.token);
      const {
        body: { token },
      } = await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/impersonations`)
        .expect(201);

      for (const refused of [
        as(token).get('/support/tickets'),
        as(token)
          .post('/support/tickets')
          .send({ subject: 'Hola', message: 'Hola' }),
        as(token).get(`/support/tickets/${ticket.id}`),
        as(token)
          .post(`/support/tickets/${ticket.id}/messages`)
          .send({ text: 'Hola' }),
      ]) {
        await refused.expect(403, { reason: 'impersonation-not-allowed' });
      }
    });
  });

  describe('closing and reopening', () => {
    it('lets the Account close one of its Tickets, and not anyone else’s', async () => {
      const ticket = await open(ana.token);
      const bea = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('bea'),
      );

      await as(bea.token)
        .post(`/support/tickets/${ticket.id}/close`)
        .expect(404, { reason: 'support-ticket-not-found' });
      const { body } = await as(ana.token)
        .post(`/support/tickets/${ticket.id}/close`)
        .expect(200);

      expect(body).toMatchObject({ id: ticket.id, status: 'closed' });
      const { body: list } = await as(ana.token)
        .get('/support/tickets')
        .expect(200);
      expect(list.tickets[0].status).toBe('closed');
      // Closing a Closed one again changes nothing.
      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/close`)
        .expect(200);
    });

    it('lets an Administrator close any Ticket', async () => {
      const ticket = await open(ana.token);

      const { body } = await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);

      expect(body).toMatchObject({ id: ticket.id, status: 'closed' });
      const { body: thread } = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(thread.status).toBe('closed');
      await as(ana.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(404);
    });

    it('opens a Closed Ticket again when either side writes in it', async () => {
      const ticket = await open(ana.token);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);

      const { body: byAccount } = await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Vuelve a pasar.' })
        .expect(201);
      expect(byAccount.status).toBe('open');

      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/close`)
        .expect(200);
      const { body: byAdministrator } = await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: '¿Sigue pasando?' })
        .expect(201);
      expect(byAdministrator.status).toBe('open');
    });

    it('is refused while Impersonating', async () => {
      const ticket = await open(ana.token);
      const {
        body: { token },
      } = await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/impersonations`)
        .expect(201);

      await as(token)
        .post(`/support/tickets/${ticket.id}/close`)
        .expect(403, { reason: 'impersonation-not-allowed' });
    });

    it('orders the Account’s Open Tickets before its Closed ones', async () => {
      const closed = await open(ana.token, 'Cerrada');
      await running.clock.advance(MINUTE);
      const opened = await open(ana.token, 'Abierta');
      await running.clock.advance(MINUTE);
      await as(ana.token)
        .post(`/support/tickets/${closed.id}/messages`)
        .send({ text: 'Lo último.' })
        .expect(201);
      await as(ana.token)
        .post(`/support/tickets/${closed.id}/close`)
        .expect(200);

      const { body } = await as(ana.token).get('/support/tickets').expect(200);

      expect(body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual([
        opened.id,
        closed.id,
      ]);
    });
  });

  describe("the Administrators' side", () => {
    it('orders waiting, then the other Open, then Closed, and filters by Open and by Closed', async () => {
      const closed = await open(ana.token, 'Cerrada');
      await running.clock.advance(MINUTE);
      const answered = await open(ana.token, 'Respondida');
      await as(administrator.token)
        .post(`/admin/support/tickets/${answered.id}/messages`)
        .send({ text: 'Mirado.' })
        .expect(201);
      await running.clock.advance(MINUTE);
      const waiting = await open(ana.token, 'Sin respuesta');
      await running.clock.advance(MINUTE);
      // Written in last, but Closed: it goes after every Open one.
      await as(ana.token)
        .post(`/support/tickets/${closed.id}/messages`)
        .send({ text: 'Ya está.' })
        .expect(201);
      await as(ana.token)
        .post(`/support/tickets/${closed.id}/close`)
        .expect(200);
      const ours = (tickets: { id: string }[]) =>
        tickets
          .map((ticket) => ticket.id)
          .filter((id) => [closed.id, answered.id, waiting.id].includes(id));
      const statuses = (tickets: { status: string }[]) =>
        tickets.map((ticket) => ticket.status);

      const all = await as(administrator.token)
        .get('/admin/support/tickets')
        .expect(200);
      expect(ours(all.body.tickets)).toEqual([
        waiting.id,
        answered.id,
        closed.id,
      ]);
      const firstClosed = statuses(all.body.tickets).indexOf('closed');
      expect(statuses(all.body.tickets).slice(firstClosed)).not.toContain(
        'open',
      );

      const openOnes = await as(administrator.token)
        .get('/admin/support/tickets?status=open')
        .expect(200);
      expect(ours(openOnes.body.tickets)).toEqual([waiting.id, answered.id]);
      expect(statuses(openOnes.body.tickets)).not.toContain('closed');
      expect(openOnes.body.total).toBe(openOnes.body.tickets.length);

      const closedOnes = await as(administrator.token)
        .get('/admin/support/tickets?status=closed')
        .expect(200);
      expect(ours(closedOnes.body.tickets)).toEqual([closed.id]);
      expect(statuses(closedOnes.body.tickets)).not.toContain('open');
      // The waiting count is the same whatever the filter.
      expect(closedOnes.body.waiting).toBe(all.body.waiting);

      await as(administrator.token)
        .get('/admin/support/tickets?status=pending')
        .expect(400, { reason: 'invalid-admin-query' });
    });

    it('lists every Ticket, those waiting for an answer first, with its Account', async () => {
      const answered = await open(ana.token, 'Ya respondida');
      await running.clock.advance(MINUTE);
      await as(administrator.token)
        .post(`/admin/support/tickets/${answered.id}/messages`)
        .send({ text: 'Mirado.' })
        .expect(201);
      await running.clock.advance(MINUTE);
      const waiting = await open(ana.token, 'Sin respuesta');

      const { body } = await as(administrator.token)
        .get('/admin/support/tickets')
        .expect(200);

      const ours = body.tickets.filter((ticket: { id: string }) =>
        [answered.id, waiting.id].includes(ticket.id),
      );
      expect(ours).toEqual([
        expect.objectContaining({
          id: waiting.id,
          subject: 'Sin respuesta',
          status: 'open',
          waitingFor: 'administrators',
          account: { id: ana.id, displayName: null, email: anaEmail },
          openedBy: null,
          lastMessage: {
            from: 'account',
            writer: { id: ana.id, displayName: null, email: anaEmail },
            writtenAt: '2026-01-01T00:02:00.000Z',
          },
        }),
        expect.objectContaining({
          id: answered.id,
          waitingFor: 'account',
          lastMessage: {
            from: 'administrator',
            writer: expect.objectContaining({
              id: administrator.id,
              email: ADMINISTRATOR_EMAIL,
            }),
            writtenAt: '2026-01-01T00:01:00.000Z',
          },
        }),
      ]);
      expect(body).toMatchObject({ page: 1, pageSize: 50 });
      // Every waiting Ticket on the shared database counts, ours among them.
      expect(body.waiting).toBeGreaterThanOrEqual(1);
      const waitingFirst = body.tickets.map(
        (ticket: { status: string; waitingFor: string }) =>
          ticket.status === 'open' && ticket.waitingFor === 'administrators',
      );
      expect(waitingFirst).toEqual(
        [...waitingFirst].sort((a, b) => Number(b) - Number(a)),
      );
    });

    it('reads any thread and writes in it, signed Runout towards the Account', async () => {
      const ticket = await open(ana.token);
      await running.clock.advance(MINUTE);

      const written = await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: '¿A qué hora fue?' })
        .expect(201);

      expect(written.body).toMatchObject({
        id: ticket.id,
        account: { id: ana.id, email: anaEmail },
        subject: 'Una mano sale mal',
        status: 'open',
        waitingFor: 'account',
        messages: [
          {
            from: 'account',
            writer: { id: ana.id, email: anaEmail },
            text: 'El héroe es otro jugador.',
          },
          {
            from: 'administrator',
            writer: { id: administrator.id, email: ADMINISTRATOR_EMAIL },
            text: '¿A qué hora fue?',
            writtenAt: '2026-01-01T00:01:00.000Z',
          },
        ],
      });
      const read = await as(administrator.token)
        .get(`/admin/support/tickets/${ticket.id}`)
        .expect(200);
      expect(read.body).toEqual(written.body);

      const { body: thread } = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(thread.messages[1]).toEqual({
        id: expect.any(String),
        from: 'runout',
        text: '¿A qué hora fue?',
        writtenAt: '2026-01-01T00:01:00.000Z',
      });
      expect(JSON.stringify(thread)).not.toContain(ADMINISTRATOR_EMAIL);
      const { body: list } = await as(ana.token)
        .get('/support/tickets')
        .expect(200);
      expect(list.tickets[0].lastMessage.from).toBe('runout');

      await running.clock.advance(MINUTE);
      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'A las 22:41.' })
        .expect(201);
      const { body: again } = await as(administrator.token)
        .get(`/admin/support/tickets/${ticket.id}`)
        .expect(200);
      expect(again.waitingFor).toBe('administrators');
    });

    it('keeps reading and writing in a Suspended Account’s Tickets', async () => {
      const ticket = await open(ana.token);
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      await as(administrator.token)
        .get(`/admin/support/tickets/${ticket.id}`)
        .expect(200);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Lo vemos.' })
        .expect(201);
    });

    it('opens a Ticket with an Account, which it sees from Runout in its list', async () => {
      const opened = await as(administrator.token)
        .post('/admin/support/tickets')
        .send({
          accountId: ana.id,
          subject: '  Tu importación  ',
          message: 'Hola. Lo estamos revisando.',
        })
        .expect(201);

      expect(opened.body).toMatchObject({
        account: { id: ana.id, email: anaEmail },
        subject: 'Tu importación',
        status: 'open',
        waitingFor: 'account',
        createdAt: '2026-01-01T00:00:00.000Z',
        openedBy: { id: administrator.id, email: ADMINISTRATOR_EMAIL },
        messages: [
          {
            from: 'administrator',
            writer: { id: administrator.id, email: ADMINISTRATOR_EMAIL },
            text: 'Hola. Lo estamos revisando.',
          },
        ],
      });
      const { body: panel } = await as(administrator.token)
        .get('/admin/support/tickets')
        .expect(200);
      expect(
        panel.tickets.find(
          (ticket: { id: string }) => ticket.id === opened.body.id,
        ),
      ).toMatchObject({ openedBy: { id: administrator.id } });

      const { body: list } = await as(ana.token)
        .get('/support/tickets')
        .expect(200);
      expect(list.tickets).toEqual([
        expect.objectContaining({
          id: opened.body.id,
          subject: 'Tu importación',
          lastMessage: {
            from: 'runout',
            writtenAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ]);
      const { body: thread } = await as(ana.token)
        .get(`/support/tickets/${opened.body.id}`)
        .expect(200);
      expect(thread).toMatchObject({
        openedBy: 'runout',
        messages: [{ from: 'runout', text: 'Hola. Lo estamos revisando.' }],
      });
      expect(JSON.stringify(thread)).not.toContain(ADMINISTRATOR_EMAIL);
    });

    it('refuses to open a Ticket without a subject or a message, or with no such Account', async () => {
      const opening = (body: object) =>
        as(administrator.token).post('/admin/support/tickets').send(body);

      await opening({
        accountId: ana.id,
        subject: ' ',
        message: 'Hola',
      }).expect(400, { reason: 'invalid-support-subject' });
      await opening({ accountId: ana.id, subject: 'Hola', message: '' }).expect(
        400,
        { reason: 'invalid-support-message' },
      );
      for (const accountId of [
        undefined,
        'not-an-account',
        crypto.randomUUID(),
      ]) {
        await opening({ accountId, subject: 'Hola', message: 'Hola' }).expect(
          404,
          { reason: 'not-found' },
        );
      }
      const { body } = await as(ana.token).get('/support/tickets').expect(200);
      expect(body.tickets).toEqual([]);
    });

    it('refuses to open a new Ticket with a Suspended Account', async () => {
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      await as(administrator.token)
        .post('/admin/support/tickets')
        .send({ accountId: ana.id, subject: 'Hola', message: 'Hola' })
        .expect(403, { reason: 'support-account-suspended' });

      const { body } = await as(administrator.token)
        .get('/admin/support/tickets')
        .expect(200);
      expect(
        body.tickets.filter(
          (ticket: { account: { id: string } }) => ticket.account.id === ana.id,
        ),
      ).toEqual([]);
    });

    it('is not there for anyone but an Administrator', async () => {
      const ticket = await open(ana.token);

      for (const refused of [
        as(ana.token).get('/admin/support/tickets'),
        as(ana.token)
          .post('/admin/support/tickets')
          .send({ accountId: ana.id, subject: 'Hola', message: 'Hola' }),
        as(ana.token).get(`/admin/support/tickets/${ticket.id}`),
        as(ana.token)
          .post(`/admin/support/tickets/${ticket.id}/messages`)
          .send({ text: 'Hola' }),
      ]) {
        await refused.expect(404);
      }
      await as(administrator.token)
        .get('/admin/support/tickets/not-a-ticket')
        .expect(404, { reason: 'support-ticket-not-found' });
    });
  });

  describe('Tickets about a Bulk Import', () => {
    const pointedAt = (id: string) => ({
      id,
      status: 'failed',
      files: [{ name: 'sesiones-2023.zip', size: 1024 }],
      total: 210_000,
      processed: 58_000,
      imported: 58_000,
      reason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:01:00.000Z',
    });

    it('lets the Account open a Ticket pointing at one of its Bulk Imports, shown on both sides', async () => {
      const bulkImportId = await endedBulkImport(running.databaseUrl, ana.id, {
        failureCode: 'BATCH_INSERT_FAILED',
      });

      const { body: opened } = await as(ana.token)
        .post('/support/tickets')
        .send({
          subject: 'Problema con la importación sesiones-2023.zip',
          message: 'Se quedó a medias.',
          bulkImportId,
        })
        .expect(201);

      expect(opened.bulkImport).toEqual(pointedAt(bulkImportId));
      const { body: read } = await as(ana.token)
        .get(`/support/tickets/${opened.id}`)
        .expect(200);
      expect(read.bulkImport).toEqual(pointedAt(bulkImportId));
      const { body: panel } = await as(administrator.token)
        .get(`/admin/support/tickets/${opened.id}`)
        .expect(200);
      expect(panel.bulkImport).toEqual({
        ...pointedAt(bulkImportId),
        failureCode: 'BATCH_INSERT_FAILED',
      });
    });

    it('points a generic Ticket at nothing', async () => {
      const ticket = await open(ana.token);

      const { body: read } = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(read.bulkImport).toBeNull();
      const { body: panel } = await as(administrator.token)
        .get(`/admin/support/tickets/${ticket.id}`)
        .expect(200);
      expect(panel.bulkImport).toBeNull();
    });

    it("refuses to point the Account's Ticket at someone else's Bulk Import, or at none there is", async () => {
      const bea = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('bea'),
      );
      const beas = await endedBulkImport(running.databaseUrl, bea.id);

      for (const bulkImportId of [beas, crypto.randomUUID(), 'not-an-id']) {
        await as(ana.token)
          .post('/support/tickets')
          .send({ subject: 'Hola', message: 'Hola', bulkImportId })
          .expect(404, { reason: 'bulk-import-not-found' });
      }
      const { body } = await as(ana.token).get('/support/tickets').expect(200);
      expect(body.tickets).toEqual([]);
    });

    it('lets an Administrator open a Ticket with an Account pointing at its Bulk Import, which the Account sees', async () => {
      const bulkImportId = await endedBulkImport(running.databaseUrl, ana.id);

      const { body: opened } = await as(administrator.token)
        .post('/admin/support/tickets')
        .send({
          accountId: ana.id,
          subject: 'Tu importación sesiones-2023.zip se ha detenido',
          message: 'Lo estamos revisando.',
          bulkImportId,
        })
        .expect(201);

      expect(opened).toMatchObject({
        account: { id: ana.id },
        bulkImport: { id: bulkImportId, status: 'failed' },
      });
      const { body: thread } = await as(ana.token)
        .get(`/support/tickets/${opened.id}`)
        .expect(200);
      expect(thread.bulkImport).toEqual(pointedAt(bulkImportId));
    });

    it("refuses to point an Administrator's Ticket at a Bulk Import of another Account", async () => {
      const bea = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('bea'),
      );
      const beas = await endedBulkImport(running.databaseUrl, bea.id);

      await as(administrator.token)
        .post('/admin/support/tickets')
        .send({
          accountId: ana.id,
          subject: 'Hola',
          message: 'Hola',
          bulkImportId: beas,
        })
        .expect(404, { reason: 'bulk-import-not-found' });
    });

    it('refuses a Ticket about a Bulk Import with a Suspended Account', async () => {
      const bulkImportId = await endedBulkImport(running.databaseUrl, ana.id);
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);

      await as(administrator.token)
        .post('/admin/support/tickets')
        .send({
          accountId: ana.id,
          subject: 'Hola',
          message: 'Hola',
          bulkImportId,
        })
        .expect(403, { reason: 'support-account-suspended' });
    });
  });

  describe("the Importaciones tab's Accounts", () => {
    let own: RunningApp;

    beforeEach(async () => {
      own = await startApp({
        ownDatabase: true,
        administratorEmails: [ADMINISTRATOR_EMAIL],
      });
    });

    afterEach(async () => {
      await own.close();
    });

    it('says which Bulk Imports are of a Suspended Account, for "Abrir incidencia" to be unavailable', async () => {
      const admin = await signInAdministrator(own);
      const cara = await invitedAccount(own, admin.token, uniqueEmail('cara'));
      const dani = await invitedAccount(own, admin.token, uniqueEmail('dani'));
      const caras = await endedBulkImport(own.databaseUrl, cara.id);
      const danis = await endedBulkImport(own.databaseUrl, dani.id);
      await request(own.httpServer)
        .post(`/api/admin/accounts/${dani.id}/suspension`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);

      const { body } = await request(own.httpServer)
        .get('/api/admin/bulk-imports')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      const suspended = Object.fromEntries(
        body.imports.map((each: { id: string; accountSuspended: boolean }) => [
          each.id,
          each.accountSuspended,
        ]),
      );
      expect(suspended).toEqual({ [caras]: false, [danis]: true });
    });
  });
});
