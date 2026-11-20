import request from 'supertest';
import { startApp, type RunningApp } from './support/app.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';

const SECOND_ADMINISTRATOR = 'second-admin@runout.test';
const WEB = 'http://localhost:5173';

describe('Support emails (e2e)', () => {
  let running: RunningApp;
  let administrator: { token: string; id: string };
  let anaEmail: string;
  let ana: { token: string; id: string };

  beforeEach(async () => {
    running = await startApp({
      administratorEmails: [ADMINISTRATOR_EMAIL, SECOND_ADMINISTRATOR],
    });
    administrator = await signInAdministrator(running);
    anaEmail = uniqueEmail('ana');
    ana = await invitedAccount(running, administrator.token, anaEmail);
  });

  afterEach(async () => {
    await running.close();
  });

  const as = (token: string) => ({
    post: (path: string) =>
      request(running.httpServer)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(running.httpServer)
        .patch(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  async function open(subject: string, message: string) {
    const { body } = await as(ana.token)
      .post('/support/tickets')
      .send({ subject, message })
      .expect(201);
    return body as { id: string };
  }

  /** Every email sent since `before`. */
  const since = (before: number) => running.inbox.sent.slice(before);

  describe('to the Administrators', () => {
    it('tells every Administrator when an Account opens a Ticket, with an excerpt and a link to the panel', async () => {
      const before = running.inbox.sent.length;
      const ticket = await open(
        'Una mano sale mal',
        'El héroe es otro jugador.',
      );

      const sent = since(before);
      expect(sent.map((email) => email.to).sort()).toEqual(
        [ADMINISTRATOR_EMAIL, SECOND_ADMINISTRATOR].sort(),
      );
      const email = running.inbox.last(ADMINISTRATOR_EMAIL);
      expect(email.subject).toBe('Nueva incidencia: Una mano sale mal');
      expect(email.text).toContain(anaEmail);
      expect(email.text).toContain('El héroe es otro jugador.');
      expect(email.text).toContain(`${WEB}/admin/support/${ticket.id}`);
    });

    it('tells every Administrator when an Account writes in a Ticket, in each one’s language', async () => {
      await as(administrator.token)
        .patch('/identities/me/preferences')
        .send({ language: 'en' })
        .expect(200);
      const ticket = await open('Una mano sale mal', 'El héroe es otro.');
      const before = running.inbox.sent.length;

      await as(ana.token)
        .post(`/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Sigue pasando con la mano de ayer.' })
        .expect(201);

      const sent = since(before);
      expect(sent.map((email) => email.to).sort()).toEqual(
        [ADMINISTRATOR_EMAIL, SECOND_ADMINISTRATOR].sort(),
      );
      const english = sent.find((email) => email.to === ADMINISTRATOR_EMAIL)!;
      expect(english.subject).toBe(
        'New message in a ticket: Una mano sale mal',
      );
      expect(english.text).toContain('Sigue pasando con la mano de ayer.');
      expect(english.text).toContain(`${WEB}/admin/support/${ticket.id}`);
      const spanish = sent.find((email) => email.to === SECOND_ADMINISTRATOR)!;
      expect(spanish.subject).toBe(
        'Nuevo mensaje en una incidencia: Una mano sale mal',
      );
    });

    it('carries a short excerpt, never the whole message', async () => {
      const long = `${'Primera parte del mensaje. '.repeat(20)}FINAL SECRETO`;
      const before = running.inbox.sent.length;
      await open('Largo', long);

      const email = since(before)[0];
      expect(email.text).toContain('Primera parte del mensaje.');
      expect(email.text).toContain('…');
      expect(email.text).not.toContain('FINAL SECRETO');
      expect(email.html).not.toContain('FINAL SECRETO');
    });
  });

  describe('to the Account', () => {
    it('tells the Account when an Administrator writes in its Ticket, with an excerpt and a link to its page', async () => {
      const ticket = await open('Una mano sale mal', 'El héroe es otro.');
      const before = running.inbox.sent.length;

      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Lo hemos corregido: vuelve a importarla.' })
        .expect(201);

      const sent = since(before);
      expect(sent.map((email) => email.to)).toEqual([anaEmail]);
      const email = sent[0];
      expect(email.subject).toBe('Runout te ha respondido: Una mano sale mal');
      expect(email.text).toContain('Lo hemos corregido: vuelve a importarla.');
      expect(email.text).toContain(`${WEB}/support/${ticket.id}`);
      expect(email.text).not.toContain('/admin/');
    });

    it('writes to the Account in the language of its Preferences', async () => {
      await as(ana.token)
        .patch('/identities/me/preferences')
        .send({ language: 'en' })
        .expect(200);
      const ticket = await open('A hand looks wrong', 'The hero is wrong.');

      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'We fixed it.' })
        .expect(201);
      expect(running.inbox.last(anaEmail).subject).toBe(
        'Runout has answered you: A hand looks wrong',
      );

      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);
      expect(running.inbox.last(anaEmail).subject).toBe(
        'Runout has closed your ticket: A hand looks wrong',
      );
    });

    it('tells the Account when an Administrator closes its Ticket, once, and not when it closes it itself', async () => {
      const ticket = await open('Una mano sale mal', 'El héroe es otro.');
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Ya está resuelto.' })
        .expect(201);
      const before = running.inbox.sent.length;

      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);

      const sent = since(before);
      expect(sent.map((email) => email.to)).toEqual([anaEmail]);
      expect(sent[0].subject).toBe(
        'Runout ha cerrado tu incidencia: Una mano sale mal',
      );
      expect(sent[0].text).toContain('Ya está resuelto.');
      expect(sent[0].text).toContain(`${WEB}/support/${ticket.id}`);

      const other = await open('Otra', 'Otra cosa.');
      const afterOpen = running.inbox.sent.length;
      await as(ana.token)
        .post(`/support/tickets/${other.id}/close`)
        .expect(200);
      expect(since(afterOpen)).toEqual([]);
    });

    it('sends nothing to a Suspended Account', async () => {
      const ticket = await open('Una mano sale mal', 'El héroe es otro.');
      await as(administrator.token)
        .post(`/admin/accounts/${ana.id}/suspension`)
        .expect(204);
      const before = running.inbox.to(anaEmail).length;

      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/messages`)
        .send({ text: 'Te escribimos igualmente.' })
        .expect(201);
      await as(administrator.token)
        .post(`/admin/support/tickets/${ticket.id}/close`)
        .expect(200);

      expect(running.inbox.to(anaEmail)).toHaveLength(before);
    });
  });
});
