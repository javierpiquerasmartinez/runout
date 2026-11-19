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

/** The Streets after preflop, whose Stats sit in their own columns. */
type Street = 'flop' | 'turn' | 'river';
const STREETS: Street[] = ['flop', 'turn', 'river'];

/** A raise answered to a C-bet faced, over C-bet faced. */
function raiseCbet(street: Street): StatFacts {
  const {
    columns: [faced, answer],
    since,
  } = read(`${street}-cbet-faced`, `${street}-cbet-answer`);
  return perHand(faced, sql`${faced} and ${answer} = 'raise'`, since);
}

/**
 * Check-call or Check-fold: over Check-raise's chance (the Hero checked,
 * then faced a bet they could raise), the Hero's line on the Street begins
 * with the check and that answer. With Check-raise, they add up to 100 %.
 */
function checkThen(street: Street, line: 'XC' | 'XF'): StatFacts {
  const {
    columns: [chance, heroLine],
    since,
  } = read(`${street}-check-raise-chance`, `${street}-line`);
  return perHand(
    chance,
    sql`${chance} and ${heroLine} like ${`${line}%`}`,
    since,
  );
}

/**
 * Bet-fold: the Hero's bet raised (check-raised too), answered with a fold.
 * The Raise Action's faced is a raise of the Hero's bet.
 */
function betFold(street: Street): StatFacts {
  return foldOverFaced(`${street}-raise`);
}

/** The Hero's Actions of the given kinds on those Streets, from the per-Street counters. */
function postflopActions(kinds: Counter[], streets: Street[] = STREETS) {
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

/** AFq over every postflop Street, or over one: counted Action by Action. */
function afq(streets: Street[] = STREETS): StatFacts {
  const all = postflopActions(['bets', 'raises', 'calls', 'folds'], streets);
  const aggressive = postflopActions(['bets', 'raises'], streets);
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
 * onto the facts row. The 21 that `heroStats` also works out match its
 * definitions there.
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
  'raise-cbet-flop': raiseCbet('flop'),
  'check-raise-flop': didOverChance('flop-check-raise'),
  'fold-to-check-raise-flop': foldOverFaced('flop-check-raise'),
  'check-call-flop': checkThen('flop', 'XC'),
  'check-fold-flop': checkThen('flop', 'XF'),
  'bet-fold-flop': betFold('flop'),
  'afq-flop': afq(['flop']),
  'cbet-turn': didOverChance('turn-cbet'),
  'fold-to-cbet-turn': foldOverFaced('turn-cbet'),
  'raise-cbet-turn': raiseCbet('turn'),
  'check-raise-turn': didOverChance('turn-check-raise'),
  'fold-to-check-raise-turn': foldOverFaced('turn-check-raise'),
  'check-call-turn': checkThen('turn', 'XC'),
  'check-fold-turn': checkThen('turn', 'XF'),
  'bet-fold-turn': betFold('turn'),
  'afq-turn': afq(['turn']),
  'cbet-river': didOverChance('river-cbet'),
  'fold-to-cbet-river': foldOverFaced('river-cbet'),
  'raise-cbet-river': raiseCbet('river'),
  'check-raise-river': didOverChance('river-check-raise'),
  'fold-to-check-raise-river': foldOverFaced('river-check-raise'),
  'check-call-river': checkThen('river', 'XC'),
  'check-fold-river': checkThen('river', 'XF'),
  'bet-fold-river': betFold('river'),
  'afq-river': afq(['river']),
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
