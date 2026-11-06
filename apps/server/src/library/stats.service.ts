import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { handStats, hands, libraryEntries } from '../database/schema.js';
import {
  STAT_KEYS,
  type HeroStats,
  type StatKey,
} from '../hands/replay/hero-stats.js';
import type { Identity } from '../identity/identity.service.js';
import { libraryFilterWhere, type LibraryFilter } from './library-filter.js';

/** The Hero's Stats over the Hands a Library filter keeps. */
export interface LibraryStats {
  /** How many Hands the Stats cover: as many as the list and the Results count. */
  hands: number;
  /**
   * Every Stat, in the Stats view's order, with its opportunities and taken
   * counts summed over those Hands; zero for a Stat the Hero never had the
   * chance at. Counts, not percentages.
   */
  stats: HeroStats;
  /**
   * Every Stat, with how many of those Hands had its opportunity and how
   * many had it taken: the Hands the `stat=` criterion keeps for each side,
   * so the count a Stat's link shows is the count the list then holds. Apart
   * from the sums because a Stat such as AFq counts several Actions per Hand.
   */
  handsWith: Record<StatKey, StatHands>;
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

  async stats(account: Identity, filter: LibraryFilter): Promise<LibraryStats> {
    const kept = libraryFilterWhere(account.id, filter);
    // One snapshot, so an import landing in between can't set the count
    // apart from the sums.
    return this.db.transaction(
      async (tx) => {
        const counted = await tx.execute<{ hands: number }>(sql`
          select count(*)::int as hands
          from ${libraryEntries}
          inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
          where ${kept}
        `);
        const summed = await tx.execute<{
          stat: StatKey;
          opportunities: number;
          taken: number;
          handsWithOpportunity: number;
          handsWithTaken: number;
        }>(sql`
          select
            ${handStats.stat} as stat,
            sum(${handStats.opportunities})::int as opportunities,
            sum(${handStats.taken})::int as taken,
            count(*) filter (where ${handStats.opportunities} > 0)::int as "handsWithOpportunity",
            count(*) filter (where ${handStats.taken} > 0)::int as "handsWithTaken"
          from ${libraryEntries}
          inner join ${hands} on ${eq(hands.id, libraryEntries.handId)}
          inner join ${handStats} on ${eq(handStats.handId, hands.id)}
          where ${kept}
          group by ${handStats.stat}
        `);
        const byKey = new Map(summed.rows.map((row) => [row.stat, row]));
        const stats = Object.fromEntries(
          STAT_KEYS.map((key) => [
            key,
            {
              opportunities: byKey.get(key)?.opportunities ?? 0,
              taken: byKey.get(key)?.taken ?? 0,
            },
          ]),
        ) as HeroStats;
        const handsWith = Object.fromEntries(
          STAT_KEYS.map((key) => [
            key,
            {
              opportunity: byKey.get(key)?.handsWithOpportunity ?? 0,
              taken: byKey.get(key)?.handsWithTaken ?? 0,
            },
          ]),
        ) as Record<StatKey, StatHands>;
        return { hands: counted.rows[0].hands, stats, handsWith };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
