import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { handFacts, hands, libraryEntries } from '../database/schema.js';
import {
  STAT_KEYS,
  type StatCount,
  type StatKey,
} from '../hands/replay/hero-stats.js';
import type { Identity } from '../identity/identity.service.js';
import { libraryFilterWhere, type LibraryFilter } from './library-filter.js';
import { countsTowards, handCounts, STAT_FACTS } from './stat-facts.js';

/** The Hero's Stats over the Hands a Library filter keeps. */
export interface LibraryStats {
  /** How many Hands the Stats cover: as many as the list and the Results count. */
  hands: number;
  /**
   * Every Stat, in the Stats view's order, with its opportunities and taken
   * counts summed over those Hands; zero for a Stat the Hero never had the
   * chance at. Counts, not percentages. AF, a ratio, answers its
   * aggressive Actions and its calls instead, never their quotient, so a
   * Hero who never called is a count of zero, not an infinity.
   */
  stats: Record<StatKey, StatCount | StatRatio>;
  /**
   * Every Stat, with how many of those Hands had its opportunity and how
   * many had it taken: the Hands the `stat=` criterion keeps for each side,
   * so the count a Stat's link shows is the count the list then holds. Apart
   * from the sums because a Stat such as AFq counts several Actions per Hand.
   */
  handsWith: Record<StatKey, StatHands>;
}

/** A ratio Stat (AF): the Hero's bets and raises, and their calls. */
export interface StatRatio {
  ratio: true;
  aggressive: number;
  calls: number;
}

/** How many Hands had a Stat's opportunity, and how many had it taken. */
export interface StatHands {
  opportunity: number;
  taken: number;
}

/** The Library's Stats, answered by the database. */
@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * One pass over the Hands the filter keeps, so the count and the sums
   * share one snapshot. Each Hand counts from its facts row (`STAT_FACTS`);
   * one whose row is missing, or older than a Stat needs, still counts in
   * `hands` but not towards that Stat.
   */
  async stats(account: Identity, filter: LibraryFilter): Promise<LibraryStats> {
    const kept = libraryFilterWhere(account.id, filter);
    // Each Stat's Hands on either side, and for one counted per Action or a
    // ratio, its sums too; for any other the sums are those Hands.
    const sums = STAT_KEYS.flatMap((key, index) => {
      const stat = STAT_FACTS[key];
      const counts = countsTowards(key);
      return [
        sql`count(*) filter (where ${counts} and ${handCounts(key, 'opportunity')})::int as ${sql.identifier(`ho${index}`)}`,
        sql`count(*) filter (where ${counts} and ${handCounts(key, 'taken')})::int as ${sql.identifier(`ht${index}`)}`,
        ...('ratio' in stat
          ? [
              sql`coalesce(sum(${stat.aggressive}) filter (where ${counts}), 0)::int as ${sql.identifier(`a${index}`)}`,
              sql`coalesce(sum(${stat.calls}) filter (where ${counts}), 0)::int as ${sql.identifier(`c${index}`)}`,
            ]
          : []),
        ...('perAction' in stat && stat.perAction
          ? [
              sql`coalesce(sum(${stat.opportunities}) filter (where ${counts}), 0)::int as ${sql.identifier(`o${index}`)}`,
              sql`coalesce(sum(${stat.taken}) filter (where ${counts}), 0)::int as ${sql.identifier(`t${index}`)}`,
            ]
          : []),
      ];
    });
    const result = await this.db.execute<Record<string, number>>(sql`
      select count(*)::int as hands, ${sql.join(sums, sql`, `)}
      from ${libraryEntries}
      inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
      left join ${handFacts} on ${eq(handFacts.handId, hands.id)}
      where ${kept}
    `);
    const [row] = result.rows;
    const stats = Object.fromEntries(
      STAT_KEYS.map((key, index): [StatKey, StatCount | StatRatio] => {
        const stat = STAT_FACTS[key];
        if ('ratio' in stat) {
          return [
            key,
            {
              ratio: true,
              aggressive: row[`a${index}`],
              calls: row[`c${index}`],
            },
          ];
        }
        return [
          key,
          stat.perAction
            ? { opportunities: row[`o${index}`], taken: row[`t${index}`] }
            : { opportunities: row[`ho${index}`], taken: row[`ht${index}`] },
        ];
      }),
    ) as LibraryStats['stats'];
    const handsWith = Object.fromEntries(
      STAT_KEYS.map((key, index) => [
        key,
        { opportunity: row[`ho${index}`], taken: row[`ht${index}`] },
      ]),
    ) as Record<StatKey, StatHands>;
    return { hands: row.hands, stats, handsWith };
  }
}
