import { Rejected } from '../rejection/rejection.js';
import { parseLibraryFilter } from './library-filter.js';

/**
 * What a Saved Filter keeps: the Más filtros part of a Filter (CONTEXT.md,
 * Saved Filter), never the period, Poker Sites, Heroes, Stakes, Marks or
 * Tags. Each criterion is written as the Library's query writes it: `facts`
 * as `fact` values (`!hero-position:BB`), `stat` as the `stat` value
 * (`vpip:taken`), so the web applies them as they come.
 */
export interface SavedCriteria {
  facts: string[];
  stat: string | null;
}

/**
 * The criteria as the database keeps them: a document with its own format,
 * so a later change of shape can still read the older ones.
 */
export interface StoredCriteria {
  format: typeof FORMAT;
  facts: string[];
  stat: string | null;
}

const FORMAT = 1;

/** Criteria sent by the web; `invalid-saved-filter-criteria` if empty or not a Filter. */
export function savedCriteriaOf(raw: unknown): SavedCriteria {
  if (typeof raw !== 'object' || raw === null) throw invalid();
  const { facts, stat } = raw as { facts?: unknown; stat?: unknown };
  if (
    !Array.isArray(facts) ||
    !facts.every((fact) => typeof fact === 'string') ||
    (stat !== null && typeof stat !== 'string') ||
    (facts.length === 0 && stat === null)
  ) {
    throw invalid();
  }
  const criteria = { facts: facts as string[], stat };
  if (!readable(criteria.facts, criteria.stat)) throw invalid();
  return criteria;
}

export function storedCriteria(criteria: SavedCriteria): StoredCriteria {
  return { format: FORMAT, ...criteria };
}

/**
 * The criteria of a stored document, without any on a fact or Stat the
 * Library no longer knows: `dropped` says how many, so the player is told.
 */
export function readSavedCriteria(stored: StoredCriteria): {
  criteria: SavedCriteria;
  dropped: number;
} {
  const facts = stored.facts.filter((fact) => readable([fact], null));
  const stat =
    stored.stat !== null && readable([], stored.stat) ? stored.stat : null;
  const dropped =
    stored.facts.length - facts.length + (stored.stat !== stat ? 1 : 0);
  return { criteria: { facts, stat }, dropped };
}

/** Whether the Library's query would accept these criteria. */
function readable(facts: string[], stat: string | null): boolean {
  try {
    parseLibraryFilter(stat === null ? { fact: facts } : { fact: facts, stat });
    return true;
  } catch (error) {
    if (error instanceof Rejected) return false;
    throw error;
  }
}

function invalid(): Rejected {
  return new Rejected('invalid-saved-filter-criteria');
}
