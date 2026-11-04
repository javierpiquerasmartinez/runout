import { Logger } from '@nestjs/common';

/** One email, as written: plain readable HTML with a text alternative. */
export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Where the server sends email from. Injectable, like the Google verifier:
 * Resend in production, the console in local development, an inbox the test
 * reads in e2e tests.
 */
export interface Mailer {
  /** Rejects when the email could not be handed over for delivery. */
  send(email: Email): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Local development: prints each email instead of sending it, links and all. */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  send(email: Email): Promise<void> {
    this.logger.log(
      `To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`,
    );
    return Promise.resolve();
  }
}

/** Sends through Resend's HTTP API, from a sender on a domain verified there. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: Email): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, ...email, to: [email.to] }),
    });
    if (!res.ok) {
      throw new Error(
        `Resend refused the email: ${res.status} ${await res.text()}`,
      );
    }
  }
}

/**
 * The mailer the environment asks for. Production, the only place
 * `FRONTEND_URL` is set, needs Resend's settings and refuses to start without
 * them; anywhere else email goes to the console.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer {
  if (!env.FRONTEND_URL) return new ConsoleMailer();
  const apiKey = env.RESEND_API_KEY || undefined;
  const from = env.EMAIL_FROM || undefined;
  if (!apiKey || !from) {
    throw new Error(
      'RESEND_API_KEY and EMAIL_FROM must be set to send Invitations and password resets. See the README.',
    );
  }
  return new ResendMailer(apiKey, from);
}

/** Where the links in emails lead: the web's origin, the first of `FRONTEND_URL`'s. */
export function frontendUrlFromEnv(env: NodeJS.ProcessEnv): string {
  const first = (env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .find(Boolean);
  return (first ?? 'http://localhost:5173').replace(/\/$/, '');
}

export const FRONTEND_URL = Symbol('FRONTEND_URL');
