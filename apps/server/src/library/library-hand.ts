import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { libraryEntries } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * The id of a Hand in this person's Library, for what they change on it from
 * there. Anything else — a Hand of someone else's Library only, or no id at
 * all — is `hand-not-found`, as if it didn't exist.
 */
export async function requireInLibrary(
  db: Database,
  account: Identity,
  handId: unknown,
): Promise<string> {
  if (!isUuid(handId)) throw new Rejected('hand-not-found');
  const [row] = await db
    .select({ handId: libraryEntries.handId })
    .from(libraryEntries)
    .where(
      and(
        eq(libraryEntries.identityId, account.id),
        eq(libraryEntries.handId, handId),
      ),
    );
  if (!row) throw new Rejected('hand-not-found');
  return handId;
}
