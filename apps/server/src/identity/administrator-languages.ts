import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { identities, preferences } from '../database/schema.js';
import type { Language } from '../mail/emails.js';
import type { AdministratorEmails } from './administrators.js';
import { DEFAULT_PREFERENCES } from './identity.service.js';

/**
 * Every Administrator, with their Account's language, or the default one
 * before they have an Account. Their emails are matched ignoring case.
 */
export async function administratorLanguages(
  db: Database,
  administrators: AdministratorEmails,
): Promise<{ email: string; language: Language }[]> {
  const emails = administrators.list();
  if (emails.length === 0) return [];
  const email = sql<string>`lower(${identities.email})`;
  const languages = new Map(
    (
      await db
        .select({ email, language: preferences.language })
        .from(identities)
        .innerJoin(preferences, eq(preferences.identityId, identities.id))
        .where(inArray(email, emails))
    ).map((row) => [row.email, row.language]),
  );
  return emails.map((to) => ({
    email: to,
    language: languages.get(to) ?? DEFAULT_PREFERENCES.language,
  }));
}
