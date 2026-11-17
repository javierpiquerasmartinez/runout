import { and, gte, inArray, lte, not, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { handFacts, hands } from '../database/schema.js';
import {
  HAND_CLASSES,
  POSITIONS,
  POT_TYPES,
} from '../hands/replay/hero-facts.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * A criterion on one of the Hero's facts (ADR 0012): the values that keep a
 * Hand, any one of them (OR), or for a number a range, both ends included.
 * An exclusion keeps the Hands it wouldn't.
 *
 * Query: `fact`, repeated for each criterion, written
 * `[!]<fact>:<value>[,<value>…]`, or `[!]<fact>:<min>..<max>` for a number,
 * where either end may be left out. `!` makes it an exclusion. For example
 * `fact=pot-type:3-bet,4-bet`, `fact=!hero-position:BB`, `fact=players:..4`.
 */
export type FactCriterion = {
  fact: FactKey;
  exclude: boolean;
} & (
  { values: string[] } | { range: { min: number | null; max: number | null } }
);

/** How a fact's values are written, and which ones it can take. */
type Domain =
  | { kind: 'set'; values: ReadonlySet<string> }
  | { kind: 'boolean' }
  | { kind: 'range'; min: number; max: number };

interface FactEntry {
  column: PgColumn;
  domain: Domain;
  /**
   * The rules version that added the fact. A row worked out by an older one
   * doesn't have it, so no criterion on the fact keeps that Hand, excluded
   * or not, until the re-derive job reaches it.
   */
  since: number;
}

const oneOf = (values: readonly string[]): Domain => ({
  kind: 'set',
  values: new Set(values),
});

/**
 * Every fact a criterion can name, by the name the query gives it. Adding
 * one is a column on `hand_facts`, its derivation in `heroFacts`, an entry
 * here, and a new rules version.
 */
const FACTS = {
  players: {
    column: handFacts.playersDealt,
    domain: { kind: 'range', min: 2, max: 10 },
    since: 1,
  },
  'hero-position': {
    column: handFacts.heroPosition,
    domain: oneOf(POSITIONS),
    since: 1,
  },
  'hero-class': {
    column: handFacts.heroHandClass,
    domain: oneOf(HAND_CLASSES),
    since: 1,
  },
  'pot-type': {
    column: handFacts.potType,
    domain: oneOf(POT_TYPES),
    since: 1,
  },
  'opener-position': {
    column: handFacts.openerPosition,
    domain: oneOf(POSITIONS),
    since: 1,
  },
  'three-bettor-position': {
    column: handFacts.threeBettorPosition,
    domain: oneOf(POSITIONS),
    since: 1,
  },
  'four-bettor-position': {
    column: handFacts.fourBettorPosition,
    domain: oneOf(POSITIONS),
    since: 1,
  },
  'aggressor-position': {
    column: handFacts.aggressorPosition,
    domain: oneOf(POSITIONS),
    since: 1,
  },
  'hero-aggressor': {
    column: handFacts.heroAggressor,
    domain: { kind: 'boolean' },
    since: 1,
  },
} satisfies Record<string, FactEntry>;

export type FactKey = keyof typeof FACTS;

function entryOf(fact: string): FactEntry | undefined {
  return Object.hasOwn(FACTS, fact)
    ? (FACTS as Record<string, FactEntry>)[fact]
    : undefined;
}

/** Reads one `fact` query value; `invalid-library-filter` if it can't. */
export function parseFactCriterion(raw: string): FactCriterion {
  const exclude = raw.startsWith('!');
  const [fact, written, ...rest] = (exclude ? raw.slice(1) : raw).split(':');
  const entry = entryOf(fact);
  if (!entry || written === undefined || rest.length > 0) throw invalid();
  const key = fact as FactKey;
  const { domain } = entry;
  if (domain.kind === 'range') {
    return { fact: key, exclude, range: rangeOf(written, domain) };
  }
  const values = written.split(',');
  const allowed =
    domain.kind === 'boolean' ? new Set(['true', 'false']) : domain.values;
  if (!values.every((value) => allowed.has(value))) throw invalid();
  return { fact: key, exclude, values: [...new Set(values)] };
}

/** `2..6`, `..4` or `6..` within the domain's bounds. */
function rangeOf(
  written: string,
  domain: { min: number; max: number },
): { min: number | null; max: number | null } {
  const ends = written.split('..');
  if (ends.length !== 2) throw invalid();
  const [min, max] = ends.map((end) => {
    if (end === '') return null;
    if (!/^\d+$/.test(end)) throw invalid();
    const value = Number(end);
    if (value < domain.min || value > domain.max) throw invalid();
    return value;
  });
  if (
    (min === null && max === null) ||
    (min !== null && max !== null && min > max)
  ) {
    throw invalid();
  }
  return { min, max };
}

function invalid(): Rejected {
  return new Rejected('invalid-library-filter');
}

/**
 * The Hands whose facts row meets every criterion: AND across them, OR
 * within one. Every fact lives on the one row, so criteria on several facts
 * describe the same Hand. A Hand with no row yet matches none.
 */
export function factCriteriaWhere(criteria: FactCriterion[]): SQL {
  const conditions = criteria.map((criterion) => {
    const entry = entryOf(criterion.fact)!;
    const met =
      'range' in criterion
        ? and(
            criterion.range.min === null
              ? undefined
              : gte(entry.column, criterion.range.min),
            criterion.range.max === null
              ? undefined
              : lte(entry.column, criterion.range.max),
          )!
        : inArray(
            entry.column,
            entry.domain.kind === 'boolean'
              ? criterion.values.map((value) => value === 'true')
              : criterion.values,
          );
    // A fact that is empty (null) never meets a criterion, so excluding one
    // keeps the Hand.
    const kept = criterion.exclude ? not(sql`coalesce(${met}, false)`) : met;
    return and(gte(handFacts.version, entry.since), kept)!;
  });
  return sql`exists (select 1 from ${handFacts} where ${handFacts.handId} = ${hands.id} and ${and(...conditions)})`;
}
