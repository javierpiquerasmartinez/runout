// Times the Library's views on the Library `db:seed-library` seeded: the
// list, the Results Graph, the Stats and the hand ids, with no Filter and
// with the most used criteria alone and two at a time, over all time and
// over one month. For each it prints the median of five HTTP requests and
// the database's own time for each query the view runs (EXPLAIN ANALYZE),
// and writes every plan to `--plans`. With `--toggle <index>` (repeatable)
// it measures each case without the index and then with it, back to back.
//
// Needs `nest build` (it reads the views' queries from dist) and the server
// running in Test mode at `--server`, on the database at DATABASE_URL.
//
//   pnpm --filter @runout/server db:library-bench -- --out before.json
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../dist/database/schema.js';
import { parseLibraryFilter } from '../dist/library/library-filter.js';
import { parseLibrarySort } from '../dist/library/library-sort.js';
import { LibraryService } from '../dist/library/library.service.js';
import { ResultsService } from '../dist/library/results.service.js';
import { StatsService } from '../dist/library/stats.service.js';

const { values: args } = parseArgs({
  options: {
    persona: { type: 'string', default: 'bench' },
    server: { type: 'string', default: 'http://localhost:3000' },
    out: { type: 'string', default: 'library-bench.json' },
    plans: { type: 'string', default: 'library-bench-plans.txt' },
    runs: { type: 'string', default: '5' },
    only: { type: 'string' },
    toggle: { type: 'string', multiple: true },
  },
});
const RUNS = Number(args.runs);

try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

/** The criteria the ticket measures, as the address writes them. */
const CRITERIA: Record<string, string> = {
  pot: 'fact=pot-type:single-raised',
  position: 'fact=hero-position:BTN',
  ip: 'fact=flop-ip:true',
  role: 'fact=preflop-role:opener',
  'cbet-chance': 'fact=flop-cbet-chance:true',
  cbet: 'fact=flop-cbet-did:true',
  texture: 'fact=flop-suits:monotone',
};
/** The last month the seeded Library covers. */
const MONTH = 'from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z';

const names = Object.keys(CRITERIA);
const sets: string[][] = [
  [],
  ...names.map((name) => [name]),
  ...names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b])),
];
const cases = sets
  .flatMap((set) =>
    (['all', 'month'] as const).map((period) => ({
      name: `${set.length === 0 ? 'none' : set.join('+')} / ${period}`,
      query: [
        ...set.map((name) => CRITERIA[name]),
        ...(period === 'month' ? [MONTH] : []),
      ].join('&'),
    })),
  )
  .concat([{ name: 'stat vpip:taken / all', query: 'stat=vpip:taken' }])
  .filter((c) => !args.only || new RegExp(args.only).test(c.name));

const VIEWS = {
  list: '/api/library/hands',
  results: '/api/library/results',
  stats: '/api/library/stats',
  'hand-ids': '/api/library/hand-ids',
} as const;
type View = keyof typeof VIEWS;

const signIn = await fetch(`${args.server}/api/sessions/google`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken: `dev-sign-in|${args.persona}` }),
});
if (!signIn.ok) throw new Error(`Signing in failed (${signIn.status}).`);
const { token, identity } = (await signIn.json()) as {
  token: string;
  identity: { id: string };
};

// The views' own queries, caught as they run, to explain them.
let caught: { query: string; params: unknown[] }[] = [];
// No query is waited on for longer than this: one that takes it is a finding,
// recorded as `null` with its plan (EXPLAIN without ANALYZE), not a number.
const CAP_MS = 60_000;
const pool = new pg.Pool({
  connectionString: url,
  options: `-c statement_timeout=${CAP_MS}`,
});
const timedOut = (error: unknown) =>
  (error as { code?: string }).code === '57014' ||
  (error as Error).name === 'TimeoutError';
const db = drizzle({
  client: pool,
  schema,
  logger: { logQuery: (query, params) => caught.push({ query, params }) },
});
const library = new LibraryService(
  db as never,
  null as never,
  null as never,
  { list: async () => [] } as never,
  null as never,
);
const results = new ResultsService(db as never);
const stats = new StatsService(db as never);
const account = { id: identity.id } as never;

async function viewQueries(view: View, query: string) {
  const parsed = Object.fromEntries(
    [...new URLSearchParams(query)].reduce((all, [key, value]) => {
      all.set(key, [...(all.get(key) ?? []), value]);
      return all;
    }, new Map<string, string[]>()),
  );
  const filter = parseLibraryFilter(parsed);
  const sort = parseLibrarySort({});
  caught = [];
  try {
    if (view === 'list') await library.page(account, filter, sort, 1, 50);
    if (view === 'results') await results.results(account, filter, 500);
    if (view === 'stats') await stats.stats(account, filter);
    if (view === 'hand-ids') await library.handIds(account, filter, sort);
  } catch (error) {
    // The query that took the cap was caught before it ran; explained below.
    if (!timedOut(error)) throw error;
  }
  // Only the queries that read the filtered Hands.
  return caught.filter(
    ({ query }) =>
      query.includes('library_entries') && query.includes('"hands"'),
  );
}

/** The median time of `RUNS` runs after one to warm up; null if one takes the cap. */
async function median(run: () => Promise<unknown>): Promise<number | null> {
  const times: number[] = [];
  try {
    await run();
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      await run();
      times.push(performance.now() - start);
    }
  } catch (error) {
    if (timedOut(error)) return null;
    throw error;
  }
  times.sort((a, b) => a - b);
  return Math.round(times[Math.floor(RUNS / 2)]);
}

/** Times in ms; null where the query took the cap. */
type Timings = Record<View, { http: number | null; sql: (number | null)[] }>;
const capped: string[] = [];

/** Each view's timings for one case, as the indexes stand. */
async function measure(name: string, query: string): Promise<Timings> {
  const timings = {} as Timings;
  for (const view of Object.keys(VIEWS) as View[]) {
    const http = await median(async () => {
      const response = await fetch(
        `${args.server}${VIEWS[view]}${query ? `?${query}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(CAP_MS),
        },
      );
      if (!response.ok) throw new Error(`${view} ${query}: ${response.status}`);
      await response.arrayBuffer();
    });
    const sqlTimes: (number | null)[] = [];
    for (const { query: text, params } of await viewQueries(view, query)) {
      let lines: string[];
      try {
        const plan = await pool.query(
          `explain (analyze, buffers) ${text}`,
          params,
        );
        lines = plan.rows.map((row) => row['QUERY PLAN'] as string);
        const execution = lines.find((line) =>
          line.startsWith('Execution Time'),
        );
        sqlTimes.push(Math.round(Number(/([\d.]+) ms/.exec(execution!)![1])));
      } catch (error) {
        if (!timedOut(error)) throw error;
        const plan = await pool.query(`explain ${text}`, params);
        lines = [
          `TOOK THE ${CAP_MS} ms CAP; the plan, not run:`,
          ...plan.rows.map((row) => row['QUERY PLAN'] as string),
        ];
        sqlTimes.push(null);
      }
      plans.push(`### ${name} · ${view}\n${text}\n${lines.join('\n')}\n`);
    }
    timings[view] = { http, sql: sqlTimes };
    if (http === null || sqlTimes.includes(null))
      capped.push(`${name} ${view}`);
    const shown = (time: number | null) => (time === null ? 'CAP' : time);
    console.log(
      `${name.padEnd(38)} ${view.padEnd(9)} http ${String(shown(http)).padStart(6)} ms  sql ${sqlTimes.map(shown).join(' + ')} ms`,
    );
  }
  return timings;
}

// With `--toggle`, each case is measured twice in a row, without the named
// indexes and then with them, so that both sides see the same machine.
const toggled = await Promise.all(
  (args.toggle ?? []).map(async (index) => {
    const found = await pool.query<{ indexdef: string }>(
      'select indexdef from pg_indexes where indexname = $1',
      [index],
    );
    if (found.rowCount !== 1) throw new Error(`No index ${index} to toggle.`);
    return { index, definition: found.rows[0].indexdef };
  }),
);
async function setIndexes(present: boolean) {
  for (const { index, definition } of toggled) {
    await pool.query(
      present
        ? definition.replace(/^CREATE INDEX/, 'CREATE INDEX IF NOT EXISTS')
        : `drop index if exists ${index}`,
    );
  }
}

const out: Record<string, Timings | { without: Timings; with: Timings }> = {};
const plans: string[] = [];
try {
  for (const { name, query } of cases) {
    if (toggled.length === 0) {
      out[name] = await measure(name, query);
      continue;
    }
    await setIndexes(false);
    const without = await measure(`${name} (without)`, query);
    await setIndexes(true);
    out[name] = { without, with: await measure(`${name} (with)`, query) };
  }
} finally {
  await setIndexes(true);
}
console.log(
  capped.length === 0
    ? `No query took the ${CAP_MS} ms cap.`
    : `Took the ${CAP_MS} ms cap: ${capped.join(', ')}.`,
);
writeFileSync(args.out, JSON.stringify(out, null, 2));
writeFileSync(args.plans, plans.join('\n'));
await pool.end();
