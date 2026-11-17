import { and, gte, inArray, lte, not, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { handFacts, hands } from '../database/schema.js';
import {
  BOARD_PAIRINGS,
  BOARD_RANKS,
  FLOP_SUITS,
  LATER_SUITS,
} from '../hands/replay/board-texture.js';
import {
  ANSWERS,
  HAND_CLASSES,
  POSITIONS,
  POT_TYPES,
  STREETS,
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
 * `fact=pot-type:3-bet,4-bet`, `fact=!hero-position:BB`, `fact=players:..4`,
 * `fact=result:..-20.5`.
 */
export type FactCriterion = {
  fact: FactKey;
  exclude: boolean;
} & (
  { values: string[] } | { range: { min: number | null; max: number | null } }
);

/**
 * How a fact's values are written, and which ones it can take. A range's
 * ends are whole numbers, or with `signed` any number, negative or with
 * decimals.
 */
type Domain =
  | { kind: 'set'; values: ReadonlySet<string> }
  | { kind: 'boolean' }
  | { kind: 'range'; min: number; max: number; signed?: boolean };

type FactEntry =
  | {
      /** A column of the Hand's facts row. */
      column: PgColumn;
      domain: Domain;
      /**
       * The rules version that added the fact. A row worked out by an older
       * one doesn't have it, so no criterion on the fact keeps that Hand,
       * excluded or not, until the re-derive job reaches it.
       */
      since: number;
    }
  | {
      /**
       * A fact the Hand's own row has had since it was stored, read there
       * rather than copied into its facts row: it needs no facts row.
       */
      onHand: PgColumn | SQL;
      domain: Domain;
    };

const oneOf = (values: readonly string[]): Domain => ({
  kind: 'set',
  values: new Set(values),
});

/** Any number, negative or with decimals. */
const UNBOUNDED: Domain = {
  kind: 'range',
  min: -Infinity,
  max: Infinity,
  signed: true,
};

/** An Amount of the Hand's as big blinds of its Stake. */
function inBigBlinds(amount: PgColumn): SQL {
  return sql`(${amount}::numeric / ${hands.bigBlind})`;
}

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
  // The Board's texture on each Street (facts catalogue §3.5).
  'flop-suits': {
    column: handFacts.flopSuits,
    domain: oneOf(FLOP_SUITS),
    since: 2,
  },
  'flop-pairing': {
    column: handFacts.flopPairing,
    domain: oneOf(BOARD_PAIRINGS),
    since: 2,
  },
  'flop-straight-possible': {
    column: handFacts.flopStraightPossible,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'flop-connectedness': {
    column: handFacts.flopConnectedness,
    domain: { kind: 'range', min: 1, max: 5 },
    since: 2,
  },
  'flop-high-card': {
    column: handFacts.flopHighCard,
    domain: oneOf(BOARD_RANKS),
    since: 2,
  },
  'turn-suits': {
    column: handFacts.turnSuits,
    domain: oneOf(LATER_SUITS),
    since: 2,
  },
  'turn-pairing': {
    column: handFacts.turnPairing,
    domain: oneOf(BOARD_PAIRINGS),
    since: 2,
  },
  'turn-straight-possible': {
    column: handFacts.turnStraightPossible,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'turn-connectedness': {
    column: handFacts.turnConnectedness,
    domain: { kind: 'range', min: 1, max: 5 },
    since: 2,
  },
  'turn-high-card': {
    column: handFacts.turnHighCard,
    domain: oneOf(BOARD_RANKS),
    since: 2,
  },
  'turn-pairs-board': {
    column: handFacts.turnPairsBoard,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'turn-brings-flush': {
    column: handFacts.turnBringsFlush,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'turn-brings-straight': {
    column: handFacts.turnBringsStraight,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'turn-overcard': {
    column: handFacts.turnOvercard,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'river-suits': {
    column: handFacts.riverSuits,
    domain: oneOf(LATER_SUITS),
    since: 2,
  },
  'river-pairing': {
    column: handFacts.riverPairing,
    domain: oneOf(BOARD_PAIRINGS),
    since: 2,
  },
  'river-straight-possible': {
    column: handFacts.riverStraightPossible,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'river-connectedness': {
    column: handFacts.riverConnectedness,
    domain: { kind: 'range', min: 1, max: 5 },
    since: 2,
  },
  'river-high-card': {
    column: handFacts.riverHighCard,
    domain: oneOf(BOARD_RANKS),
    since: 2,
  },
  'river-pairs-board': {
    column: handFacts.riverPairsBoard,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'river-brings-flush': {
    column: handFacts.riverBringsFlush,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'river-brings-straight': {
    column: handFacts.riverBringsStraight,
    domain: { kind: 'boolean' },
    since: 2,
  },
  'river-overcard': {
    column: handFacts.riverOvercard,
    domain: { kind: 'boolean' },
    since: 2,
  },

  // Showdown and Result.
  'hero-folded-on': {
    column: handFacts.heroFoldedOn,
    domain: oneOf(STREETS),
    since: 3,
  },
  'hero-all-in-on': {
    column: handFacts.heroAllInOn,
    domain: oneOf(STREETS),
    since: 3,
  },
  'faced-all-in-on': {
    column: handFacts.heroFacedAllInOn,
    domain: oneOf(STREETS),
    since: 3,
  },
  'faced-all-in-answer': {
    column: handFacts.heroFacedAllInAnswer,
    domain: oneOf(ANSWERS),
    since: 3,
  },
  'won-money': {
    column: handFacts.heroWonMoney,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'won-at-showdown': {
    column: handFacts.heroWonAtShowdown,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'reached-showdown': {
    onHand: hands.heroReachedShowdown,
    domain: { kind: 'boolean' },
  },
  /** In big blinds. */
  result: {
    onHand: inBigBlinds(hands.heroResult),
    domain: UNBOUNDED,
  },
  /** In big blinds. */
  'all-in-ev': {
    onHand: inBigBlinds(hands.heroAllInEv),
    domain: UNBOUNDED,
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

/** `2..6`, `..4` or `6..` within the domain's bounds; `-20.5..` when signed. */
function rangeOf(
  written: string,
  domain: { min: number; max: number; signed?: boolean },
): { min: number | null; max: number | null } {
  const ends = written.split('..');
  if (ends.length !== 2) throw invalid();
  const number = domain.signed ? /^-?\d+(\.\d+)?$/ : /^\d+$/;
  const [min, max] = ends.map((end) => {
    if (end === '') return null;
    if (!number.test(end)) throw invalid();
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
 * The Hands whose facts meet every criterion: AND across them, OR within
 * one. Every fact lives on the one facts row, or on the Hand's own row, so
 * criteria on several facts describe the same Hand. A Hand with no facts
 * row yet matches no criterion on one.
 */
export function factCriteriaWhere(criteria: FactCriterion[]): SQL {
  const onRow: SQL[] = [];
  const onHand: SQL[] = [];
  for (const criterion of criteria) {
    const entry = entryOf(criterion.fact)!;
    if ('onHand' in entry) {
      onHand.push(conditionOf(criterion, entry.onHand, entry.domain));
    } else {
      onRow.push(
        and(
          gte(handFacts.version, entry.since),
          conditionOf(criterion, entry.column, entry.domain),
        )!,
      );
    }
  }
  return and(
    ...onHand,
    onRow.length === 0
      ? undefined
      : sql`exists (select 1 from ${handFacts} where ${handFacts.handId} = ${hands.id} and ${and(...onRow)})`,
  )!;
}

/** Whether the fact, read from `column`, meets the criterion. */
function conditionOf(
  criterion: FactCriterion,
  column: PgColumn | SQL,
  domain: Domain,
): SQL {
  const read = sql`${column}`;
  const met =
    'range' in criterion
      ? and(
          criterion.range.min === null
            ? undefined
            : gte(read, criterion.range.min),
          criterion.range.max === null
            ? undefined
            : lte(read, criterion.range.max),
        )!
      : inArray(
          read,
          domain.kind === 'boolean'
            ? criterion.values.map((value) => value === 'true')
            : criterion.values,
        );
  // A fact that is empty (null) never meets a criterion, so excluding one
  // keeps the Hand.
  return criterion.exclude ? not(sql`coalesce(${met}, false)`) : met;
}
