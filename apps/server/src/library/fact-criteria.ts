import {
  and,
  arrayOverlaps,
  gte,
  inArray,
  lte,
  not,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { handFacts, hands } from '../database/schema.js';
import { MADE_HANDS } from '@runout/poker';
import {
  BOARD_PAIRINGS,
  BOARD_RANKS,
  FLOP_SUITS,
  LATER_SUITS,
} from '../hands/replay/board-texture.js';
import {
  HAND_CLASSES,
  KICKERS,
  POSITIONS,
  POT_TYPES,
  STREET_DRAWS,
} from '../hands/replay/hero-facts.js';
import type { PostflopStreet } from '../hands/replay/street-situation.js';
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
 * `fact=turn-line:XR`, `fact=flop-spr:1.5..4`.
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
  /** A column holding several values: a criterion keeps any it overlaps. */
  | { kind: 'members'; values: ReadonlySet<string> }
  | { kind: 'boolean' }
  /** Values matching `pattern`, too many to list. */
  | { kind: 'pattern'; pattern: RegExp }
  /** Up to `decimals` decimal places on either end; none if left out. */
  | { kind: 'range'; min: number; max: number; decimals?: number };

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

const anyOf = (values: readonly string[]): Domain => ({
  kind: 'members',
  values: new Set(values),
});
const BOOLEAN: Domain = { kind: 'boolean' };

/**
 * The facts of one postflop Street, named after it: `flop-ip`, `turn-line`,
 * `river-spr`. Quantities are in big blinds, bet sizes a whole % of the pot
 * before the bet, raise sizes a multiple of the bet raised.
 */
function streetFacts<S extends PostflopStreet>(street: S, since: number) {
  const entry = (property: string, domain: Domain): FactEntry => ({
    column: handFacts[
      `${street}${property}` as keyof typeof handFacts
    ] as PgColumn,
    domain,
    since,
  });
  const decimal = (max: number, decimals: number): Domain => ({
    kind: 'range',
    min: 0,
    max,
    decimals,
  });
  const count = (max: number): Domain => ({ kind: 'range', min: 0, max });
  const entries = {
    saw: entry('Saw', BOOLEAN),
    players: entry('Players', { kind: 'range', min: 2, max: 10 }),
    ip: entry('Ip', BOOLEAN),
    first: entry('First', BOOLEAN),
    pot: entry('Pot', decimal(99_999_999, 2)),
    'effective-stack': entry('EffectiveStack', decimal(99_999_999, 2)),
    spr: entry('Spr', decimal(99_999_999, 1)),
    'all-in': entry('AllIn', BOOLEAN),
    // X check, B bet, C call, R raise, F fold; a fold only last.
    line: entry('Line', { kind: 'pattern', pattern: /^[XBCR]{0,30}[XBCRF]$/ }),
    'bet-size': entry('BetSize', decimal(1_000_000, 0)),
    'raise-size': entry('RaiseSize', decimal(999_999, 2)),
    'bet-size-faced': entry('BetSizeFaced', decimal(1_000_000, 0)),
    'raise-size-faced': entry('RaiseSizeFaced', decimal(999_999, 2)),
    bets: entry('Bets', count(30)),
    raises: entry('Raises', count(30)),
    calls: entry('Calls', count(30)),
    folds: entry('Folds', count(1)),
  };
  return Object.fromEntries(
    Object.entries(entries).map(([name, value]) => [
      `${street}-${name}`,
      value,
    ]),
  ) as { [K in keyof typeof entries as `${S}-${K}`]: FactEntry };
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
  // The Hero's cards on each Street.
  'flop-made-hand': {
    column: handFacts.flopMadeHand,
    domain: oneOf(MADE_HANDS),
    since: 3,
  },
  'flop-draw': {
    column: handFacts.flopDraws,
    domain: anyOf(STREET_DRAWS),
    since: 3,
  },
  'flop-nuts': {
    column: handFacts.flopNuts,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'flop-kicker': {
    column: handFacts.flopKicker,
    domain: oneOf(KICKERS),
    since: 3,
  },
  'flop-nut-flush-draw': {
    column: handFacts.flopNutFlushDraw,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'turn-made-hand': {
    column: handFacts.turnMadeHand,
    domain: oneOf(MADE_HANDS),
    since: 3,
  },
  'turn-draw': {
    column: handFacts.turnDraws,
    domain: anyOf(STREET_DRAWS),
    since: 3,
  },
  'turn-nuts': {
    column: handFacts.turnNuts,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'turn-kicker': {
    column: handFacts.turnKicker,
    domain: oneOf(KICKERS),
    since: 3,
  },
  'turn-nut-flush-draw': {
    column: handFacts.turnNutFlushDraw,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'river-made-hand': {
    column: handFacts.riverMadeHand,
    domain: oneOf(MADE_HANDS),
    since: 3,
  },
  'river-nuts': {
    column: handFacts.riverNuts,
    domain: { kind: 'boolean' },
    since: 3,
  },
  'river-kicker': {
    column: handFacts.riverKicker,
    domain: oneOf(KICKERS),
    since: 3,
  },
  // The situation on each postflop Street (facts catalogue §3.1, §3.3, §5).
  ...streetFacts('flop', 4),
  ...streetFacts('turn', 4),
  ...streetFacts('river', 4),
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
  const allowed = (value: string) =>
    domain.kind === 'boolean'
      ? value === 'true' || value === 'false'
      : domain.kind === 'pattern'
        ? domain.pattern.test(value)
        : domain.values.has(value);
  if (!values.every(allowed)) throw invalid();
  return { fact: key, exclude, values: [...new Set(values)] };
}

/** `2..6`, `..4`, `6..` or `1.5..3` within the domain's bounds. */
function rangeOf(
  written: string,
  domain: { min: number; max: number; decimals?: number },
): { min: number | null; max: number | null } {
  const ends = written.split('..');
  if (ends.length !== 2) throw invalid();
  const decimals = domain.decimals ?? 0;
  const number = new RegExp(
    decimals > 0 ? `^\\d+(\\.\\d{1,${decimals}})?$` : '^\\d+$',
  );
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
        : entry.domain.kind === 'members'
          ? arrayOverlaps(entry.column, criterion.values)
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
