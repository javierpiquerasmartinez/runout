import { Inject, Injectable } from '@nestjs/common';
import { eq, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { hands, libraryEntries } from '../database/schema.js';
import type { Identity } from '../identity/identity.service.js';
import { libraryFilterWhere, type LibraryFilter } from './library-filter.js';
import { boundedInt, wholeNumber } from './query.js';

/** How many points of the series to send, unless asked for fewer or more. */
const DEFAULT_POINTS = 500;
const MAX_POINTS = 2000;

/**
 * The Results Graph's lines: the Hero's Result, their All-in EV, and the
 * Result's share from Hands where the Hero reached Showdown and from every
 * other Hand.
 */
export interface ResultLines {
  result: number;
  allInEv: number;
  showdown: number;
  nonShowdown: number;
}

/** Where the lines stand after one Hand, counted from 1 in played order. */
export interface ResultsPoint {
  hand: number;
  /** The Hand itself, so it can be opened from the graph. */
  handId: string;
  /** The Hero's cards in that Hand, as the Library list shows them. */
  holeCards: string[];
  /** In big blinds of each Hand's own Stake, to the hundredth. */
  bigBlinds: ResultLines;
  /** As Amounts, only when every Hand shares one currency. */
  amounts: ResultLines | null;
}

/** A stretch of Hands, both ends counted from 1 in played order and included. */
export interface Zoom {
  from: number;
  to: number;
}

/** The running Results over the Hands a Library filter keeps, or over a Zoom of them. */
export interface Results {
  /** How many Hands the series covers: all the filter keeps, or the Zoom's. */
  hands: number;
  /** The currency every Hand the filter keeps shares, or null when they mix (or there are none). */
  currency: string | null;
  /** What each line won or lost over the Hands the series covers. */
  totals: LinesInBothUnits;
  /** Where the lines stood just before the first Hand the series covers: nothing without a Zoom. */
  start: LinesInBothUnits;
  /** The stretch the series covers, clamped to the Hands there are, or null for all of them. */
  zoom: Zoom | null;
  /**
   * The Hero's Rake Generated over the Hands the series covers. Hands
   * stored before it was kept add nothing to it.
   */
  rakeGenerated: RakeGenerated;
  /**
   * At most the points asked for, evenly spread over the Hands the series
   * covers in played order; the last one is always its last Hand. Each keeps
   * the running totals from the first Hand the filter keeps.
   */
  points: ResultsPoint[];
}

/** Rake Generated in both units: big blinds to the hundredth, and as an Amount only when every Hand shares one currency. */
export interface RakeGenerated {
  bigBlinds: number;
  amounts: number | null;
}

/** Where the lines stand, in both units. */
type LinesInBothUnits = Pick<ResultsPoint, 'bigBlinds' | 'amounts'>;

/** Running sums as the database reads them, as text: Amounts, then big blinds. */
type Sums = {
  result: string;
  all_in_ev: string;
  showdown: string;
  result_bb: string;
  all_in_ev_bb: string;
  showdown_bb: string;
  rake_generated: string;
  rake_generated_bb: string;
};

/** Where the lines and the Rake Generated stand after one Hand. */
type Standing = { point: LinesInBothUnits; rakeGenerated: RakeGenerated };

/** The Results Graph's numbers, answered by the database. */
@Injectable()
export class ResultsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The running Results over the Hands the filter keeps, at most `points`
   * of them (a number from the query; 500 unless asked otherwise). With
   * `zoomFrom` and `zoomTo` (Hand numbers from the query), only that stretch
   * of them: see `zoomOf`.
   */
  async results(
    account: Identity,
    filter: LibraryFilter,
    points: unknown,
    zoomFrom?: unknown,
    zoomTo?: unknown,
  ): Promise<Results> {
    const maxPoints = boundedInt(points, DEFAULT_POINTS, 2, MAX_POINTS);
    const kept = libraryFilterWhere(account.id, filter);
    // One snapshot, so an import landing in between can't set the count
    // apart from the series.
    return this.db.transaction(
      async (tx) => {
        const counted = await tx.execute<{
          hands: number;
          currencies: number;
          currency: string | null;
        }>(sql`
          select
            count(*)::int as hands,
            count(distinct ${hands.currency})::int as currencies,
            min(${hands.currency}) as currency
          from ${libraryEntries}
          inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
          where ${kept}
        `);
        const [{ hands: count, currencies, currency }] = counted.rows;
        const oneCurrency = currencies === 1;
        const zoom = zoomOf(zoomFrom, zoomTo, count);
        const { from, to } = zoom ?? { from: 1, to: count };
        const span = to - from + 1;
        // The running sums of every Hand, of which only the last of each of
        // `maxPoints` even stretches of the series is kept (with fewer Hands,
        // every Hand), and the one just before the series, where it starts.
        // The Hero's cards are read only for the kept points, joining back
        // on their Hands, so the window never reads a whole stored Hand.
        const running = await tx.execute<
          Sums & { hand: number; hand_id: string; hole_cards: string[] }
        >(sql`
          select running.*, point_hand.content->'hero'->'cards' as hole_cards
          from (
            select
              row_number() over played::int as hand,
              ${hands.id} as hand_id,
              ${sums(sql`over played`)}
            from ${libraryEntries}
            inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
            where ${kept}
            window played as (
              order by ${hands.playedAt}, ${hands.id}
              rows between unbounded preceding and current row
            )
          ) running
          inner join ${hands} as point_hand on point_hand.id = running.hand_id
          where hand = ${from - 1}::int
            or (
              hand between ${from}::int and ${to}::int
              and (hand - ${from - 1}::int)::bigint * ${maxPoints}::bigint / ${span}::bigint
                > (hand - ${from}::int)::bigint * ${maxPoints}::bigint / ${span}::bigint
            )
          order by hand
        `);
        const standings = running.rows.map(
          ({ hand, hand_id, hole_cards, ...sums }) => ({
            point: {
              hand,
              handId: hand_id,
              holeCards: hole_cards,
              ...linesOf(sums, oneCurrency),
            } satisfies ResultsPoint,
            rakeGenerated: rakeGeneratedOf(sums, oneCurrency),
          }),
        );
        const before =
          standings[0]?.point.hand === from - 1 ? standings.shift() : undefined;
        const start: Standing = before ?? zeroStanding(oneCurrency);
        const end: Standing = standings.at(-1) ?? zeroStanding(oneCurrency);
        return {
          hands: span,
          currency: oneCurrency ? currency : null,
          totals: linesBetween(start.point, end.point),
          start: {
            bigBlinds: start.point.bigBlinds,
            amounts: start.point.amounts,
          },
          zoom,
          rakeGenerated: rakeBetween(start.rakeGenerated, end.rakeGenerated),
          points: standings.map(({ point }) => point),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}

/**
 * The Zoom a query asks for, clamped to the `count` Hands there are; none
 * when either end is missing or not a whole number, or when the stretch
 * holds fewer than two Hands.
 */
function zoomOf(rawFrom: unknown, rawTo: unknown, count: number): Zoom | null {
  const from = wholeNumber(rawFrom);
  const to = wholeNumber(rawTo);
  if (from === null || to === null) return null;
  const zoom = { from: Math.max(1, from), to: Math.min(count, to) };
  return zoom.to - zoom.from + 1 >= 2 ? zoom : null;
}

/** Every line and the Rake Generated at nothing, as before the first Hand. */
function zeroStanding(oneCurrency: boolean): Standing {
  const zero = { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 };
  return {
    point: { bigBlinds: zero, amounts: oneCurrency ? { ...zero } : null },
    rakeGenerated: { bigBlinds: 0, amounts: oneCurrency ? 0 : null },
  };
}

/** A value in big blinds, and as an Amount only when every Hand shares one currency. */
type InBothUnits<T> = { bigBlinds: T; amounts: T | null };

/**
 * From one point to a later one, in both units, each worked out by `minus`:
 * as an Amount only when both points have one.
 */
function between<T>(
  start: InBothUnits<T>,
  end: InBothUnits<T>,
  minus: (later: T, earlier: T) => T,
): InBothUnits<T> {
  return {
    bigBlinds: minus(end.bigBlinds, start.bigBlinds),
    amounts:
      end.amounts !== null && start.amounts !== null
        ? minus(end.amounts, start.amounts)
        : null,
  };
}

/** How far one number moved to a later one, to the hundredth. */
function minusToHundredths(later: number, earlier: number): number {
  return Math.round((later - earlier) * 100) / 100;
}

/** The Rake Generated from one point to a later one, to the hundredth. */
function rakeBetween(start: RakeGenerated, end: RakeGenerated): RakeGenerated {
  return between(start, end, minusToHundredths);
}

/** What each line won or lost from one point to a later one, to the hundredth. */
function linesBetween(
  start: LinesInBothUnits,
  end: LinesInBothUnits,
): LinesInBothUnits {
  return between(start, end, (later, earlier) => {
    const line = (key: keyof ResultLines) =>
      minusToHundredths(later[key], earlier[key]);
    return {
      result: line('result'),
      allInEv: line('allInEv'),
      showdown: line('showdown'),
      nonShowdown: line('nonShowdown'),
    };
  });
}

/**
 * The Result, All-in EV, Showdown Result and Rake Generated, as Amounts and
 * in big blinds, summed over the whole set or, with a window, as running
 * sums. A Hand without a Rake Generated adds nothing to it.
 */
function sums(over: SQL) {
  const result = sql`${hands.heroResult}`;
  const allInEv = sql`${hands.heroAllInEv}`;
  const showdown = sql`case when ${hands.heroReachedShowdown} then ${hands.heroResult} else 0 end`;
  const rakeGenerated = sql`${hands.heroRakeGenerated}`;
  const bigBlinds = (amount: SQL) =>
    sql`${amount}::numeric / ${hands.bigBlind}`;
  return sql`
    coalesce(sum(${result}) ${over}, 0) as result,
    coalesce(sum(${allInEv}) ${over}, 0) as all_in_ev,
    coalesce(sum(${showdown}) ${over}, 0) as showdown,
    round(coalesce(sum(${bigBlinds(result)}) ${over}, 0), 2) as result_bb,
    round(coalesce(sum(${bigBlinds(allInEv)}) ${over}, 0), 2) as all_in_ev_bb,
    round(coalesce(sum(${bigBlinds(showdown)}) ${over}, 0), 2) as showdown_bb,
    coalesce(sum(${rakeGenerated}) ${over}, 0) as rake_generated,
    round(coalesce(sum(${bigBlinds(rakeGenerated)}) ${over}, 0), 2) as rake_generated_bb`;
}

/** The lines from their sums: the Non-showdown Result is whatever the Showdown Result leaves of the Result. */
function linesOf(sums: Sums, oneCurrency: boolean): LinesInBothUnits {
  const lines = (
    result: number,
    allInEv: number,
    showdown: number,
  ): ResultLines => ({
    result,
    allInEv,
    showdown,
    // To the hundredth, as both of the others are.
    nonShowdown: Math.round((result - showdown) * 100) / 100,
  });
  return {
    bigBlinds: lines(
      Number(sums.result_bb),
      Number(sums.all_in_ev_bb),
      Number(sums.showdown_bb),
    ),
    amounts: oneCurrency
      ? lines(
          Number(sums.result),
          Number(sums.all_in_ev),
          Number(sums.showdown),
        )
      : null,
  };
}

/** The Rake Generated from its sums. */
function rakeGeneratedOf(sums: Sums, oneCurrency: boolean): RakeGenerated {
  return {
    bigBlinds: Number(sums.rake_generated_bb),
    amounts: oneCurrency ? Number(sums.rake_generated) : null,
  };
}
