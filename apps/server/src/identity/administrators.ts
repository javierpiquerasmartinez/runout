/**
 * The emails of the Accounts that are Administrators (ADR 0008), from the
 * server's configuration only: never stored, never editable from Runout, so a
 * compromised Administrator cannot make more of them.
 */
export class AdministratorEmails {
  private readonly emails: ReadonlySet<string>;

  constructor(emails: Iterable<string>) {
    this.emails = new Set(
      [...emails].map((email) => email.trim().toLowerCase()).filter(Boolean),
    );
  }

  /** Every Administrator's email, lowercased: whom to tell of a problem. */
  list(): string[] {
    return [...this.emails];
  }

  /** Whether the Account with this email is an Administrator, ignoring case. */
  includes(email: string | null): boolean {
    return email !== null && this.emails.has(email.toLowerCase());
  }
}

export const ADMINISTRATOR_EMAILS = Symbol('ADMINISTRATOR_EMAILS');

/** `ADMINISTRATOR_EMAILS`, comma-separated; none when it is unset. */
export function administratorEmailsFromEnv(
  env: NodeJS.ProcessEnv,
): AdministratorEmails {
  return new AdministratorEmails((env.ADMINISTRATOR_EMAILS ?? '').split(','));
}
