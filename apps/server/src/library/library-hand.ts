import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { libraryEntries } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected, type RejectionReason } from '../rejection/rejection.js';

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

/** Most Hands one change may name: a page of the list, twice over. */
const MAX_SELECTION = 200;

/**
 * Distinct Hand ids chosen in the Library, at least one: `invalid` when it
 * isn't such a list, `hand-not-found` for an id that can't be a Hand.
 */
export function handSelection(
  raw: unknown,
  invalid: RejectionReason,
): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SELECTION) {
    throw new Rejected(invalid);
  }
  if (!raw.every((id) => typeof id === 'string')) throw new Rejected(invalid);
  const ids = [...new Set(raw as string[])];
  if (!ids.every(isUuid)) throw new Rejected('hand-not-found');
  return ids;
}
