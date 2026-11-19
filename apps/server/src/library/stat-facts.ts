import { sql, type SQL } from 'drizzle-orm';
import { handFacts, hands } from '../database/schema.js';
import type { StatKey } from '../hands/replay/hero-stats.js';
import { factOnRow, type FactKey } from './fact-criteria.js';

/**
 * How one Hand counts towards a Stat, read off its facts row (and, for
 * reaching Showdown, its own row). Most Stats count at most once per Hand:
 * whether it had the opportunity and whether it took it, as conditions.
 * AFq counts per Action: how many opportunities and taken, as integers.
 * AF is a ratio, not a frequency: how many aggressive Actions and calls, as
 * integers; its Hands are those with either, and those with an aggressive one.
 */
export type StatFacts = (
  | { perAction: false; opportunity: SQL; taken: SQL }
  | { perAction: true; opportunities: SQL; taken: SQL }
  | { ratio: true; aggressive: SQL; calls: SQL }
) & {
  /**
   * The rules version that added the last of the facts it reads. A Hand
   * whose facts row is missing or older counts towards the Stat neither as
   * an opportunity nor as taken, as a Filter on those facts doesn't keep
   * it, until the re-derive job reaches it (see the README).
   */
  since: number;
};

/** A named Action with a did and a chance fact: `vpip`, `flop-cbet`. */
type DidAction = {
  [K in FactKey]: K extends `${infer A}-did`
    ? `${A}-chance` extends FactKey
      ? A
      : never
    : never;
}[FactKey];

/** A named Action the Hero can face, with a faced and an answer fact. */
type FacedAction = {
  [K in FactKey]: K extends `${infer A}-faced`
    ? `${A}-answer` extends FactKey
      ? A
      : never
    : never;
}[FactKey];

/** The per-Street counters AFq adds up. */
type Counter = 'bets' | 'raises' | 'calls' | 'folds';

/** The facts' columns as SQL, and the newest `since` among them. */
function read(...facts: FactKey[]) {
  const rows = facts.map(factOnRow);
  return {
    columns: rows.map(({ column }) => sql`${column}`),
    since: Math.max(...rows.map(({ since }) => since)),
  };
}

/** A Stat counted at most once per Hand; a null condition doesn't hold. */
function perHand(opportunity: SQL, taken: SQL, since: number): StatFacts {
  return { perAction: false, opportunity, taken, since };
}

/** A named Action's did over its chance: `vpip`, `flop-cbet`. */
function didOverChance(action: DidAction): StatFacts {
  const {
    columns: [did, chance],
    since,
  } = read(`${action}-did`, `${action}-chance`);
  return perHand(chance, did, since);
}

/** A defensive Stat: the Action answered with a fold, over faced. */
function foldOverFaced(action: FacedAction): StatFacts {
  return answerOverFaced(action, 'fold');
}

/** The Action answered with `answer`, over faced: Limp-call is the Isolate called. */
function answerOverFaced(
  action: FacedAction,
  answer: 'fold' | 'call' | 'raise',
): StatFacts {
  const {
    columns: [faced, answered],
    since,
  } = read(`${action}-faced`, `${action}-answer`);
  return perHand(faced, sql`${faced} and ${answered} = ${answer}`, since);
}

type PostflopStreet = 'flop' | 'turn' | 'river';

/** The Hero's postflop Actions of the given kinds, from the per-Street counters, on the given Streets. */
function postflopActions(
  kinds: Counter[],
  streets: PostflopStreet[] = ['flop', 'turn', 'river'],
) {
  const { columns, since } = read(
    ...streets.flatMap((street) =>
      kinds.map((kind): FactKey => `${street}-${kind}`),
    ),
  );
  return {
    count: sql`(${sql.join(
      columns.map((column) => sql`coalesce(${column}, 0)`),
      sql` + `,
    )})::int`,
    since,
  };
}

function afq(): StatFacts {
  const all = postflopActions(['bets', 'raises', 'calls', 'folds']);
  const aggressive = postflopActions(['bets', 'raises']);
  return {
    perAction: true,
    opportunities: all.count,
    taken: aggressive.count,
    since: Math.max(all.since, aggressive.since),
  };
}

/** AF: bets plus raises, against calls, on one Street or over all three. */
function af(...streets: PostflopStreet[]): StatFacts {
  const aggressive = postflopActions(['bets', 'raises'], streets);
  const calls = postflopActions(['calls'], streets);
  return {
    ratio: true,
    aggressive: aggressive.count,
    calls: calls.count,
    since: Math.max(aggressive.since, calls.since),
  };
}

/** WWSF, WTSD and W$SD; reaching Showdown is the Hand's own column. */
function showdownStats(): Pick<
  Record<StatKey, StatFacts>,
  'wwsf' | 'wtsd' | 'wsd'
> {
  const {
    columns: [sawFlop, wonMoney, wonAtShowdown],
    since,
  } = read('flop-saw', 'won-money', 'won-at-showdown');
  const reachedShowdown = sql`${hands.heroReachedShowdown}`;
  return {
    wwsf: perHand(sawFlop, sql`${sawFlop} and ${wonMoney}`, since),
    wtsd: perHand(sawFlop, sql`${sawFlop} and ${reachedShowdown}`, since),
    wsd: perHand(reachedShowdown, wonAtShowdown, since),
  };
}

/** A steal faced in either blind; Fold SB and Fold BB to Steal are each one blind's. */
function foldToStealIn(blind: 'SB' | 'BB'): StatFacts {
  const {
    columns: [faced, answer, position],
    since,
  } = read('steal-faced', 'steal-answer', 'hero-position');
  return perHand(
    sql`${faced} and ${position} = ${blind}`,
    sql`${faced} and ${position} = ${blind} and ${answer} = 'fold'`,
    since,
  );
}

/**
 * Every Stat as facts (facts catalogue §5): the one place a Stat is mapped
 * onto the facts row. The 21 that `heroStats` knows match its definitions
 * there, which the facts' tests check them against.
 */
export const STAT_FACTS: Record<StatKey, StatFacts> = {
  vpip: didOverChance('vpip'),
  pfr: didOverChance('pfr'),
  rfi: didOverChance('open'),
  limp: didOverChance('limp'),
  // The limp's answers to the first raise after it, its Isolate.
  'limp-fold': answerOverFaced('isolate', 'fold'),
  'limp-call': answerOverFaced('isolate', 'call'),
  'limp-raise': answerOverFaced('isolate', 'raise'),
  isolate: didOverChance('isolate'),
  'three-bet': didOverChance('three-bet'),
  'fold-to-three-bet': foldOverFaced('three-bet'),
  'four-bet': didOverChance('four-bet'),
  'fold-to-four-bet': foldOverFaced('four-bet'),
  'five-bet': didOverChance('five-bet'),
  'fold-to-five-bet': foldOverFaced('five-bet'),
  squeeze: didOverChance('squeeze'),
  'fold-to-squeeze': foldOverFaced('squeeze'),
  'cold-call': didOverChance('cold-call'),
  'fold-sb-to-steal': foldToStealIn('SB'),
  'fold-bb-to-steal': foldToStealIn('BB'),
  steal: didOverChance('steal'),
  resteal: didOverChance('resteal'),
  'fold-to-resteal': foldOverFaced('resteal'),
  'cbet-flop': didOverChance('flop-cbet'),
  'fold-to-cbet-flop': foldOverFaced('flop-cbet'),
  'check-raise-flop': didOverChance('flop-check-raise'),
  'af-flop': af('flop'),
  'cbet-turn': didOverChance('turn-cbet'),
  'fold-to-cbet-turn': foldOverFaced('turn-cbet'),
  'af-turn': af('turn'),
  'cbet-river': didOverChance('river-cbet'),
  'fold-to-cbet-river': foldOverFaced('river-cbet'),
  'af-river': af('river'),
  af: af('flop', 'turn', 'river'),
  // Per Action: every postflop bet, raise, call or fold is an opportunity.
  afq: afq(),
  ...showdownStats(),
};

/** The Hand's facts row is recent enough for the Stat. */
export function countsTowards(key: StatKey): SQL {
  return sql`${handFacts.version} >= ${STAT_FACTS[key].since}`;
}

/**
 * Whether the Hand had the Stat's opportunity, or took it, read off its
 * facts row once that row counts towards the Stat.
 */
export function handCounts(key: StatKey, side: 'opportunity' | 'taken'): SQL {
  const stat = STAT_FACTS[key];
  if ('ratio' in stat) {
    // "Con acción": a bet, raise or call; "Agresivas": a bet or raise.
    return side === 'taken'
      ? sql`${stat.aggressive} > 0`
      : sql`${stat.aggressive} + ${stat.calls} > 0`;
  }
  if (!stat.perAction) {
    return side === 'taken' ? stat.taken : stat.opportunity;
  }
  return sql`${side === 'taken' ? stat.taken : stat.opportunities} > 0`;
}

/**
 * The Hands a Stat criterion keeps: those with the Stat's opportunity, or
 * those that took it, as the Stats count them.
 */
export function statCriterionWhere(
  key: StatKey,
  side: 'opportunity' | 'taken',
): SQL {
  return sql`exists (select 1 from ${handFacts} where ${handFacts.handId} = ${hands.id} and ${countsTowards(key)} and ${handCounts(key, side)})`;
}
