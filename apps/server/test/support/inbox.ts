import type { Email, Mailer } from '../../src/mail/mailer.js';

/** Stands in for Resend: keeps every email sent, for a test to read its links. */
export class FakeInbox implements Mailer {
  readonly sent: Email[] = [];
  private failing = 0;

  send(email: Email): Promise<void> {
    if (this.failing > 0) {
      this.failing -= 1;
      return Promise.reject(new Error('The fake inbox refused the email.'));
    }
    this.sent.push(email);
    return Promise.resolve();
  }

  /** Makes the next `count` sends fail, as Resend would when it's down. */
  failNext(count = 1): void {
    this.failing += count;
  }

  /** Every email sent to `to`, oldest first. */
  to(to: string): Email[] {
    return this.sent.filter((email) => email.to === to);
  }

  /** The last email sent to `to`; fails the test when there is none. */
  last(to: string): Email {
    const email = this.to(to).at(-1);
    if (!email) throw new Error(`No email was sent to ${to}.`);
    return email;
  }

  /** The token of the last link of `kind` sent to `to`. */
  token(to: string, kind: 'invitation' | 'reset-password'): string {
    const match = this.last(to).text.match(
      new RegExp(`/${kind}/([A-Za-z0-9_-]+)`),
    );
    if (!match) throw new Error(`The last email to ${to} has no ${kind} link.`);
    return match[1];
  }
}
