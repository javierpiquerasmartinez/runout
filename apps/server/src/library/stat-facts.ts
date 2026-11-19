import { sql, type SQL } from 'drizzle-orm';
import { handFacts, hands } from '../database/schema.js';
import type { StatKey } from '../hands/replay/hero-stats.js';
import { factOnRow, type FactKey } from './fact-criteria.js';

/**
 * How one Hand counts towards a Stat, read off its facts row (and, for
 * reaching Showdown, its own row). Most Stats count at most once per Hand:
 * whether it had the opportunity and whether it took it, as conditions.
 * AFq counts per Action: how many opportunities and taken, as integers.
 */
export type StatFacts = (
  | { perAction: false; opportunity: SQL; taken: SQL }
  | { perAction: true; opportunities: SQL; taken: SQL }
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
  const {
    columns: [faced, answer],
    since,
  } = read(`${action}-faced`, `${action}-answer`);
  return perHand(faced, sql`${faced} and ${answer} = 'fold'`, since);
}

/** The Hero's postflop Actions of the given kinds, from the per-Street counters. */
function postflopActions(kinds: Counter[]) {
  const { columns, since } = read(
    ...(['flop', 'turn', 'river'] as const).flatMap((street) =>
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

/** A steal faced in either blind; the Stat is the big blind's alone. */
function foldBbToSteal(): StatFacts {
  const {
    columns: [faced, answer, position],
    since,
  } = read('steal-faced', 'steal-answer', 'hero-position');
  return perHand(
    sql`${faced} and ${position} = 'BB'`,
    sql`${faced} and ${position} = 'BB' and ${answer} = 'fold'`,
    since,
  );
}

/**
 * Every Stat as facts (facts catalogue §5): the one place a Stat is mapped
 * onto the facts row. Each matches its definition in `heroStats`, which
 * still writes the per-Stat rows until they are retired.
 */
export const STAT_FACTS: Record<StatKey, StatFacts> = {
  vpip: didOverChance('vpip'),
  pfr: didOverChance('pfr'),
  'three-bet': didOverChance('three-bet'),
  'fold-to-three-bet': foldOverFaced('three-bet'),
  'four-bet': didOverChance('four-bet'),
  'fold-to-four-bet': foldOverFaced('four-bet'),
  squeeze: didOverChance('squeeze'),
  'cold-call': didOverChance('cold-call'),
  'fold-bb-to-steal': foldBbToSteal(),
  steal: didOverChance('steal'),
  'cbet-flop': didOverChance('flop-cbet'),
  'fold-to-cbet-flop': foldOverFaced('flop-cbet'),
  'donk-flop': didOverChance('flop-donk-bet'),
  'fold-to-donk-flop': foldOverFaced('flop-donk-bet'),
  'check-raise-flop': didOverChance('flop-check-raise'),
  'cbet-turn': didOverChance('turn-cbet'),
  'fold-to-cbet-turn': foldOverFaced('turn-cbet'),
  'delayed-cbet-turn': didOverChance('turn-delayed-cbet'),
  'fold-to-delayed-cbet-turn': foldOverFaced('turn-delayed-cbet'),
  'probe-turn': didOverChance('turn-probe'),
  'fold-to-probe-turn': foldOverFaced('turn-probe'),
  'float-turn': didOverChance('turn-float'),
  'fold-to-float-turn': foldOverFaced('turn-float'),
  'donk-turn': didOverChance('turn-donk-bet'),
  'fold-to-donk-turn': foldOverFaced('turn-donk-bet'),
  'cbet-river': didOverChance('river-cbet'),
  'fold-to-cbet-river': foldOverFaced('river-cbet'),
  'probe-river': didOverChance('river-probe'),
  'fold-to-probe-river': foldOverFaced('river-probe'),
  'float-river': didOverChance('river-float'),
  'fold-to-float-river': foldOverFaced('river-float'),
  'donk-river': didOverChance('river-donk-bet'),
  'fold-to-donk-river': foldOverFaced('river-donk-bet'),
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
