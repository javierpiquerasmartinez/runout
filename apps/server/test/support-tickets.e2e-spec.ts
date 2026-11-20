import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';

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
          unread: false,
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

  describe('unread answers and the waiting count', () => {
    const unreadCount = async (token: string) =>
      (await as(token).get('/support/tickets/unread').expect(200)).body as {
        unread: number;
      };
    const waitingCount = async (token: string) =>
      (
        (await as(token).get('/admin/support/tickets/waiting').expect(200))
          .body as { waiting: number }
      ).waiting;
    const listed = async (token: string, id: string) =>
      (
        (await as(token).get('/support/tickets').expect(200)).body as {
          tickets: { id: string; unread: boolean }[];
        }
      ).tickets.find((ticket) => ticket.id === id);

    it('never counts what the Account wrote itself as unread', async () => {
      const ticket = await open(ana.token);
      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Otra cosa más.' })
        .expect(201);

      expect(await unreadCount(ana.token)).toEqual({ unread: 0 });
      expect(await listed(ana.token, ticket.id)).toMatchObject({
        unread: false,
      });
    });

    it('marks a Ticket with an answer from Runout unread until the Account reads its thread', async () => {
      const ticket = await open(ana.token);
      const other = await open(ana.token, 'Otra');
      await running.clock.advance(MINUTE);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Lo miramos.' })
        .expect(201);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Ya está.' })
        .expect(201);

      expect(await unreadCount(ana.token)).toEqual({ unread: 1 });
      expect(await listed(ana.token, ticket.id)).toMatchObject({
        unread: true,
      });
      expect(await listed(ana.token, other.id)).toMatchObject({
        unread: false,
      });

      const first = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(
        first.body.messages.map((m: { text: string; unread: boolean }) => [
          m.text,
          m.unread,
        ]),
      ).toEqual([
        ['El héroe es otro jugador.', false],
        ['Lo miramos.', true],
        ['Ya está.', true],
      ]);

      expect(await unreadCount(ana.token)).toEqual({ unread: 0 });
      expect(await listed(ana.token, ticket.id)).toMatchObject({
        unread: false,
      });
      const again = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(
        again.body.messages.some((m: { unread: boolean }) => m.unread),
      ).toBe(false);
    });

    it('marks a Ticket unread again when Runout answers after it was read', async () => {
      const ticket = await open(ana.token);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Primera respuesta.' })
        .expect(201);
      await as(ana.token).get(`/support/tickets/${ticket.id}`).expect(200);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Segunda respuesta.' })
        .expect(201);

      expect(await unreadCount(ana.token)).toEqual({ unread: 1 });
      const { body } = await as(ana.token)
        .get(`/support/tickets/${ticket.id}`)
        .expect(200);
      expect(body.messages.map((m: { unread: boolean }) => m.unread)).toEqual([
        false,
        false,
        true,
      ]);
    });

    it('refuses the unread count while Impersonating', async () => {
      const {
        body: { token },
      } = await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/impersonations`)
        .expect(201);

      await as(token)
        .get('/support/tickets/unread')
        .expect(403, { reason: 'impersonation-not-allowed' });
    });

    it('counts the Open Tickets the Account wrote in last, the same for every Administrator', async () => {
      await running.close();
      const secondEmail = uniqueEmail('second-admin');
      running = await startApp({
        administratorEmails: [ADMINISTRATOR_EMAIL, secondEmail],
      });
      administrator = await signInAdministrator(running);
      const second = await newAccount(
        running.httpServer,
        secondEmail,
        secondEmail,
      );
      ana = await invitedAccount(
        running,
        administrator.token,
        uniqueEmail('ana'),
      );
      const before = await waitingCount(administrator.token);

      const ticket = await open(ana.token);
      const closed = await open(ana.token, 'Cerrada');
      await as(ana.token)
        .post(`/support/tickets/${closed.id}/close`)
        .expect(200);
      expect(await waitingCount(administrator.token)).toBe(before + 1);
      expect(await waitingCount(second.token)).toBe(before + 1);

      await as(second.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Respondo yo.' })
        .expect(201);
      expect(await waitingCount(administrator.token)).toBe(before);
      expect(await waitingCount(second.token)).toBe(before);

      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Gracias, pero sigue.' })
        .expect(201);
      expect(await waitingCount(administrator.token)).toBe(before + 1);
    });

    it('keeps the waiting count for Administrators only', async () => {
      await as(ana.token).get('/admin/support/tickets/waiting').expect(404);
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
        unread: true,
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

    it('is not there for anyone but an Administrator', async () => {
      const ticket = await open(ana.token);

      for (const refused of [
        as(ana.token).get('/admin/support/tickets'),
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
});
