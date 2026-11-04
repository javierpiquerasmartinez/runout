import { Inject, Injectable } from '@nestjs/common';
import { eq, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { hands, libraryEntries } from '../database/schema.js';
import type { Identity } from '../identity/identity.service.js';
import { libraryFilterWhere, type LibraryFilter } from './library-filter.js';
import { boundedInt } from './query.js';

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
  totals: Lines;
  /** Where the lines stood just before the first Hand the series covers: nothing without a Zoom. */
  start: Lines;
  /** The stretch the series covers, clamped to the Hands there are, or null for all of them. */
  zoom: Zoom | null;
  /**
   * At most the points asked for, evenly spread over the Hands the series
   * covers in played order; the last one is always its last Hand. Each keeps
   * the running totals from the first Hand the filter keeps.
   */
  points: ResultsPoint[];
}

/** Where the lines stand, in both units. */
type Lines = Pick<ResultsPoint, 'bigBlinds' | 'amounts'>;

/** Running sums as the database reads them, as text: Amounts, then big blinds. */
type Sums = {
  result: string;
  all_in_ev: string;
  showdown: string;
  result_bb: string;
  all_in_ev_bb: string;
  showdown_bb: string;
};

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
        const series: ResultsPoint[] = running.rows.map(
          ({ hand, hand_id, hole_cards, ...sums }) => ({
            hand,
            handId: hand_id,
            holeCards: hole_cards,
            ...linesOf(sums, oneCurrency),
          }),
        );
        const before =
          series[0]?.hand === from - 1 ? series.shift() : undefined;
        const start = before
          ? { bigBlinds: before.bigBlinds, amounts: before.amounts }
          : nothing(oneCurrency);
        const end = series.at(-1) ?? nothing(oneCurrency);
        return {
          hands: span,
          currency: oneCurrency ? currency : null,
          totals: between(start, end),
          start,
          zoom,
          points: series,
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

/** A whole number from a query string, or null. */
function wholeNumber(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Every line at nothing, as before the first Hand. */
function nothing(oneCurrency: boolean): Lines {
  const zero = { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 };
  return { bigBlinds: zero, amounts: oneCurrency ? { ...zero } : null };
}

/** What each line won or lost from one point to a later one, to the hundredth. */
function between(start: Lines, end: Lines): Lines {
  const minus = (later: ResultLines, earlier: ResultLines): ResultLines => {
    const line = (key: keyof ResultLines) =>
      Math.round((later[key] - earlier[key]) * 100) / 100;
    return {
      result: line('result'),
      allInEv: line('allInEv'),
      showdown: line('showdown'),
      nonShowdown: line('nonShowdown'),
    };
  };
  return {
    bigBlinds: minus(end.bigBlinds, start.bigBlinds),
    amounts:
      end.amounts && start.amounts ? minus(end.amounts, start.amounts) : null,
  };
}

/**
 * The Result, All-in EV and Showdown Result, as Amounts and in big blinds,
 * summed over the whole set or, with a window, as running sums.
 */
function sums(over: SQL) {
  const result = sql`${hands.heroResult}`;
  const allInEv = sql`${hands.heroAllInEv}`;
  const showdown = sql`case when ${hands.heroReachedShowdown} then ${hands.heroResult} else 0 end`;
  const bigBlinds = (amount: SQL) =>
    sql`${amount}::numeric / ${hands.bigBlind}`;
  return sql`
    coalesce(sum(${result}) ${over}, 0) as result,
    coalesce(sum(${allInEv}) ${over}, 0) as all_in_ev,
    coalesce(sum(${showdown}) ${over}, 0) as showdown,
    round(coalesce(sum(${bigBlinds(result)}) ${over}, 0), 2) as result_bb,
    round(coalesce(sum(${bigBlinds(allInEv)}) ${over}, 0), 2) as all_in_ev_bb,
    round(coalesce(sum(${bigBlinds(showdown)}) ${over}, 0), 2) as showdown_bb`;
}

/** The lines from their sums: the Non-showdown Result is whatever the Showdown Result leaves of the Result. */
function linesOf(sums: Sums, oneCurrency: boolean): Lines {
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
