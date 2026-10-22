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
 * The Results Graph's lines: the Hero's Result, and its share from Hands
 * where the Hero reached Showdown and from every other Hand.
 */
export interface ResultLines {
  result: number;
  showdown: number;
  nonShowdown: number;
}

/** Where the lines stand after one Hand, counted from 1 in played order. */
export interface ResultsPoint {
  hand: number;
  /** In big blinds of each Hand's own Stake, to the hundredth. */
  bigBlinds: ResultLines;
  /** As Amounts, only when every Hand shares one currency. */
  amounts: ResultLines | null;
}

/** The running Results over the Hands a Library filter keeps. */
export interface Results {
  hands: number;
  /** The currency every Hand shares, or null when they mix (or there are none). */
  currency: string | null;
  totals: Omit<ResultsPoint, 'hand'>;
  /**
   * At most the points asked for, evenly spread over the Hands in played
   * order; the last one is always the last Hand, so it equals the totals.
   */
  points: ResultsPoint[];
}

/** Running sums as the database reads them, as text: Amounts, then big blinds. */
type Sums = {
  result: string;
  showdown: string;
  result_bb: string;
  showdown_bb: string;
};

/** The Results Graph's numbers, answered by the database. */
@Injectable()
export class ResultsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The running Results over the Hands the filter keeps, at most `points`
   * of them (a number from the query; 500 unless asked otherwise).
   */
  async results(
    account: Identity,
    filter: LibraryFilter,
    points: unknown,
  ): Promise<Results> {
    const maxPoints = boundedInt(points, DEFAULT_POINTS, 2, MAX_POINTS);
    const kept = libraryFilterWhere(account.id, filter);
    // One snapshot, so an import landing in between can't set the totals
    // apart from the series' last point.
    const [totals, running] = await this.db.transaction(
      (tx) =>
        Promise.all([
          tx.execute<
            Sums & {
              hands: number;
              currencies: number;
              currency: string | null;
            }
          >(sql`
            select
              count(*)::int as hands,
              count(distinct ${hands.currency})::int as currencies,
              min(${hands.currency}) as currency,
              ${sums(sql``)}
            from ${libraryEntries}
            inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
            where ${kept}
          `),
          // The running sums of every Hand, of which only the last of each of
          // `maxPoints` even stretches is kept: with fewer Hands, every Hand.
          tx.execute<Sums & { hand: number }>(sql`
            select * from (
              select
                row_number() over played::int as hand,
                count(*) over () as hands,
                ${sums(sql`over played`)}
              from ${libraryEntries}
              inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
              where ${kept}
              window played as (
                order by ${hands.playedAt}, ${hands.id}
                rows between unbounded preceding and current row
              )
            ) running
            where hand * ${maxPoints}::bigint / hands > (hand - 1) * ${maxPoints}::bigint / hands
            order by hand
          `),
        ]),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const [{ hands: count, currencies, currency, ...total }] = totals.rows;
    const oneCurrency = currencies === 1;
    return {
      hands: count,
      currency: oneCurrency ? currency : null,
      totals: linesOf(total, oneCurrency),
      points: running.rows.map(({ hand, ...sums }) => ({
        hand,
        ...linesOf(sums, oneCurrency),
      })),
    };
  }
}

/**
 * The Result and Showdown Result, as Amounts and in big blinds, summed over
 * the whole set or, with a window, as running sums.
 */
function sums(over: SQL) {
  const result = sql`${hands.heroResult}`;
  const showdown = sql`case when ${hands.heroReachedShowdown} then ${hands.heroResult} else 0 end`;
  const bigBlinds = (amount: SQL) =>
    sql`${amount}::numeric / ${hands.bigBlind}`;
  return sql`
    coalesce(sum(${result}) ${over}, 0) as result,
    coalesce(sum(${showdown}) ${over}, 0) as showdown,
    round(coalesce(sum(${bigBlinds(result)}) ${over}, 0), 2) as result_bb,
    round(coalesce(sum(${bigBlinds(showdown)}) ${over}, 0), 2) as showdown_bb`;
}

/** The lines from their sums: the Non-showdown Result is whatever the Showdown Result leaves of the Result. */
function linesOf(sums: Sums, oneCurrency: boolean): Omit<ResultsPoint, 'hand'> {
  const lines = (result: number, showdown: number): ResultLines => ({
    result,
    showdown,
    // To the hundredth, as both of the others are.
    nonShowdown: Math.round((result - showdown) * 100) / 100,
  });
  return {
    bigBlinds: lines(Number(sums.result_bb), Number(sums.showdown_bb)),
    amounts: oneCurrency
      ? lines(Number(sums.result), Number(sums.showdown))
      : null,
  };
}
