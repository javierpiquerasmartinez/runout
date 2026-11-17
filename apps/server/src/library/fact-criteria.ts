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
  HAND_CLASSES,
  POSITIONS,
  POT_TYPES,
} from '../hands/replay/hero-facts.js';
import {
  ANSWERS,
  PREFLOP_FACED_FIRST,
  PREFLOP_ROLES,
} from '../hands/replay/preflop-facts.js';
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
  /** A Hero's line: one letter per Action, X, B, C, R or F. */
  | { kind: 'line' }
  /** Whole numbers, unless `decimals` (sizes and stacks). */
  | { kind: 'range'; min: number; max: number; decimals?: boolean };

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

const BOOLEAN: Domain = { kind: 'boolean' };

/** A size or a stack, in big blinds or as a multiple. */
const AMOUNT: Domain = { kind: 'range', min: 0, max: 100_000, decimals: true };

type ActionFact = 'did' | 'chance' | 'faced' | 'answer';

/**
 * A named Action's facts: `<action>-did` and `<action>-chance`, booleans,
 * and, when given, `<action>-faced`, a boolean, and `<action>-answer`, one
 * of fold, call or raise.
 */
function actionFacts<A extends string, F extends ActionFact = 'did' | 'chance'>(
  action: A,
  columns: Partial<Record<ActionFact, PgColumn>>,
  since: number,
): Record<`${A}-${F}`, FactEntry> {
  return Object.fromEntries(
    Object.entries(columns).map(([fact, column]) => [
      `${action}-${fact}`,
      {
        column,
        domain: fact === 'answer' ? oneOf(ANSWERS) : BOOLEAN,
        since,
      },
    ]),
  ) as Record<`${A}-${F}`, FactEntry>;
}

/** The rules version that added the preflop facts. */
const PREFLOP_SINCE = 3;

/** The preflop facts: facts catalogue §1 and §2.2–2.3. */
const PREFLOP_FACTS = {
  ...actionFacts(
    'vpip',
    { did: handFacts.vpipDid, chance: handFacts.vpipChance },
    PREFLOP_SINCE,
  ),
  ...actionFacts(
    'pfr',
    { did: handFacts.pfrDid, chance: handFacts.pfrChance },
    PREFLOP_SINCE,
  ),
  ...actionFacts(
    'open',
    { did: handFacts.openDid, chance: handFacts.openChance },
    PREFLOP_SINCE,
  ),
  ...actionFacts(
    'limp',
    { did: handFacts.limpDid, chance: handFacts.limpChance },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'isolate', ActionFact>(
    'isolate',
    {
      did: handFacts.isolateDid,
      chance: handFacts.isolateChance,
      faced: handFacts.isolateFaced,
      answer: handFacts.isolateAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'steal', ActionFact>(
    'steal',
    {
      did: handFacts.stealDid,
      chance: handFacts.stealChance,
      faced: handFacts.stealFaced,
      answer: handFacts.stealAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'three-bet', ActionFact>(
    'three-bet',
    {
      did: handFacts.threeBetDid,
      chance: handFacts.threeBetChance,
      faced: handFacts.threeBetFaced,
      answer: handFacts.threeBetAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'squeeze', ActionFact>(
    'squeeze',
    {
      did: handFacts.squeezeDid,
      chance: handFacts.squeezeChance,
      faced: handFacts.squeezeFaced,
      answer: handFacts.squeezeAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts(
    'cold-call',
    { did: handFacts.coldCallDid, chance: handFacts.coldCallChance },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'four-bet', ActionFact>(
    'four-bet',
    {
      did: handFacts.fourBetDid,
      chance: handFacts.fourBetChance,
      faced: handFacts.fourBetFaced,
      answer: handFacts.fourBetAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'five-bet', ActionFact>(
    'five-bet',
    {
      did: handFacts.fiveBetDid,
      chance: handFacts.fiveBetChance,
      faced: handFacts.fiveBetFaced,
      answer: handFacts.fiveBetAnswer,
    },
    PREFLOP_SINCE,
  ),
  ...actionFacts<'resteal', ActionFact>(
    'resteal',
    {
      did: handFacts.restealDid,
      chance: handFacts.restealChance,
      faced: handFacts.restealFaced,
      answer: handFacts.restealAnswer,
    },
    PREFLOP_SINCE,
  ),
  'preflop-role': {
    column: handFacts.preflopRole,
    domain: oneOf(PREFLOP_ROLES),
    since: PREFLOP_SINCE,
  },
  'preflop-faced-first': {
    column: handFacts.preflopFacedFirst,
    domain: oneOf(PREFLOP_FACED_FIRST),
    since: PREFLOP_SINCE,
  },
  limpers: {
    column: handFacts.limpers,
    domain: { kind: 'range', min: 0, max: 9 },
    since: PREFLOP_SINCE,
  },
  'preflop-line': {
    column: handFacts.preflopLine,
    domain: { kind: 'line' },
    since: PREFLOP_SINCE,
  },
  'open-size': {
    column: handFacts.openSize,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'three-bet-size': {
    column: handFacts.threeBetSize,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'four-bet-size': {
    column: handFacts.fourBetSize,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'hero-raise-size': {
    column: handFacts.heroRaiseSize,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'hero-raise-multiple': {
    column: handFacts.heroRaiseMultiple,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'hero-second-raise-size': {
    column: handFacts.heroSecondRaiseSize,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'hero-second-raise-multiple': {
    column: handFacts.heroSecondRaiseMultiple,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'size-faced': {
    column: handFacts.sizeFaced,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'starting-stack': {
    column: handFacts.heroStartingStack,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  'preflop-effective-stack': {
    column: handFacts.preflopEffectiveStack,
    domain: AMOUNT,
    since: PREFLOP_SINCE,
  },
  straddle: {
    column: handFacts.straddle,
    domain: BOOLEAN,
    since: PREFLOP_SINCE,
  },
  antes: { column: handFacts.antes, domain: BOOLEAN, since: PREFLOP_SINCE },
} satisfies Record<string, FactEntry>;

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
  ...PREFLOP_FACTS,
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
  const allowed = (value: string) => {
    if (domain.kind === 'boolean') return value === 'true' || value === 'false';
    if (domain.kind === 'line') return /^[XBCRF]{1,20}$/.test(value);
    return domain.values.has(value);
  };
  if (!values.every(allowed)) throw invalid();
  return { fact: key, exclude, values: [...new Set(values)] };
}

/** `2..6`, `..4` or `6..`, or `2.5..3` with decimals, within the domain's bounds. */
function rangeOf(
  written: string,
  domain: { min: number; max: number; decimals?: boolean },
): { min: number | null; max: number | null } {
  const ends = written.split('..');
  if (ends.length !== 2) throw invalid();
  const number = domain.decimals ? /^\d+(\.\d+)?$/ : /^\d+$/;
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
