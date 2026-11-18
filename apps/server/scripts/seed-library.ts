// Seeds one Account's Library with a million Hands (or `--hands n`), for
// measuring the Library's queries at that size; never for a database anyone
// uses. Needs the server running in Test mode (DEV_SIGN_IN=true) at
// `--server` (http://localhost:3000) on the database at DATABASE_URL.
//
// It signs in as the Test mode persona `--persona` (`bench`), takes every
// Hand that Account imported before out of the database, imports the import
// fixtures through the API, so their Hands, facts and Stats are stored as any
// import stores them, and then copies those Hands in SQL with new ids and
// site hand IDs until the Library holds `--hands`. The copies are played one
// after another over the three years before 2026-11-01, so any month holds
// about a 36th of them, every fixture Hand in turn. A fixture Hand the Hero
// folded preflop is copied seven times as often as any other, so that about
// three Hands in four are folded preflop, as in a real Library, and a
// criterion keeps about the share of Hands it would keep there.
//
//   pnpm --filter @runout/server db:seed-library -- --hands 1000000
//
// Then sign in as the persona: Test mode's `dev-sign-in|bench` token.
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values: args } = parseArgs({
  options: {
    hands: { type: 'string', default: '1000000' },
    persona: { type: 'string', default: 'bench' },
    server: { type: 'string', default: 'http://localhost:3000' },
  },
});
const target = Number(args.hands);
if (!Number.isInteger(target) || target < 1) {
  throw new Error('--hands must be a whole number of Hands.');
}

try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
} catch (error) {
  // A missing .env is fine; the environment may be set directly.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

/** The fixtures whose Hands are copied: every Poker Site Runout reads. */
const FIXTURES = [
  'pokerstars-session.txt',
  'pokerstars-edge-cases.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-showdown.txt',
  'pokerstars-pot-limit.txt',
  'pokerstars-ten-max.txt',
  'ggpoker-session.txt',
  'coinpoker-session.txt',
  'coinpoker-ante.txt',
  'winamax-session.txt',
];
const fixtures = new URL('../src/hands/import/fixtures/', import.meta.url);

const FIRST_PLAYED = '2023-11-01T00:00:00Z';
const LAST_PLAYED = '2026-11-01T00:00:00Z';
const PER_BATCH = 100_000;
/** How many copies of a Hand folded preflop for each copy of any other. */
const FOLDED_WEIGHT = 7;

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const { token, identityId } = await signIn(args.persona);
  await forget(identityId);
  for (const name of FIXTURES) {
    await importText(
      token,
      freshIds(readFileSync(new URL(name, fixtures), 'utf8')),
    );
  }
  const imported = await db.query<{ id: string; folded: boolean }>(
    `select h.id, f.preflop_role = 'folded' as folded
     from library_entries e
     join hands h on h.id = e.hand_id
     join hand_facts f on f.hand_id = h.id
     where e.identity_id = $1 order by h.played_at, h.id`,
    [identityId],
  );
  console.log(`Imported ${imported.rowCount} fixture Hands.`);
  await copy(
    identityId,
    imported.rows.map((row) => row.id),
    imported.rows.flatMap((row) =>
      Array<string>(row.folded ? FOLDED_WEIGHT : 1).fill(row.id),
    ),
  );
  console.log('Analyzing…');
  await db.query('analyze');
  console.log(`The Library of ${args.persona} holds ${target} Hands.`);
} finally {
  await db.end();
}

async function signIn(
  persona: string,
): Promise<{ token: string; identityId: string }> {
  const response = await fetch(`${args.server}/api/sessions/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: `dev-sign-in|${persona}` }),
  });
  if (!response.ok) {
    throw new Error(
      `Signing in failed (${response.status}): is the server at ${args.server} running with DEV_SIGN_IN=true?`,
    );
  }
  const body = (await response.json()) as {
    token: string;
    identity: { id: string };
  };
  return { token: body.token, identityId: body.identity.id };
}

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${args.server}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return response.json() as Promise<unknown>;
}

async function importText(token: string, text: string) {
  const preview = (await api(token, 'POST', '/api/library/imports/previews', {
    text,
  })) as { id: string };
  await api(token, 'POST', '/api/library/imports', { previews: [preview.id] });
}

/** The fixture with new hand IDs, so a second seeding imports it afresh. */
function freshIds(text: string): string {
  const renamed = new Map<string, string>();
  return text.replace(
    /((?:PokerStars|CoinPoker|Poker) Hand #(?:[A-Z]+)?|HandId: #\d+-\d+-)(\d+)/g,
    (_, prefix: string, id: string) => {
      if (!renamed.has(id)) {
        renamed.set(id, `${randomInt(1e9, 1e10)}${randomInt(1e3, 1e4)}`);
      }
      return `${prefix}${renamed.get(id)}`;
    },
  );
}

/** Takes every Hand the persona imported out of the database, with what hangs off it. */
async function forget(identityId: string) {
  console.log('Removing the Hands of an earlier seeding…');
  await db.query('begin');
  await db.query(
    `create temp table gone on commit drop as
     select id from hands where importer_id = $1`,
    [identityId],
  );
  for (const table of [
    'hand_facts',
    'hand_stats',
    'marks',
    'tag_links',
    'notes',
    'library_entries',
  ]) {
    const exists = await db.query('select to_regclass($1) is not null as e', [
      table,
    ]);
    if (!exists.rows[0].e) continue;
    await db.query(
      `delete from ${table} where hand_id in (select id from gone)`,
    );
  }
  await db.query('delete from hands where id in (select id from gone)');
  await db.query('commit');
}

/**
 * Copies the fixture Hands, their facts, Stats and Library entries, in
 * batches, until the Library holds `target` Hands. Hand `s` (counted from 0
 * over every Hand, the fixture Hands first) is played at the `s`th of
 * `target` even steps over the three years, and copies the Hand at `s` in
 * `cycle`, round and round.
 */
async function copy(identityId: string, originals: string[], cycle: string[]) {
  const columns = async (table: string) =>
    (
      await db.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_name = $1 and table_schema = 'public' order by ordinal_position`,
        [table],
      )
    ).rows.map((row) => row.name);
  const handColumns = await columns('hands');
  const replaced: Record<string, string> = {
    id: 'm.new_id',
    site_hand_id: `h.site_hand_id || '-seed-' || m.seq`,
    played_at: `$1::timestamptz + m.seq * (($2::timestamptz - $1::timestamptz) / $3::int)`,
  };
  const handSelect = handColumns
    .map((column) => replaced[column] ?? `h.${column}`)
    .join(', ');
  const byHand = async (table: string) => {
    const all = await columns(table);
    return {
      list: all.join(', '),
      select: all
        .map((column) => (column === 'hand_id' ? 'm.new_id' : `t.${column}`))
        .join(', '),
    };
  };
  const facts = await byHand('hand_facts');
  const stats = await byHand('hand_stats');

  await db.query(
    `create temp table base (i int primary key, id uuid not null)`,
  );
  await db.query(
    `insert into base select ordinality - 1, id from unnest($1::uuid[]) with ordinality as u(id)`,
    [cycle],
  );
  // The fixture Hands themselves take the first places in played order.
  await db.query(
    `update hands h set played_at = $2::timestamptz + (u.n - 1) * (($3::timestamptz - $2::timestamptz) / $4::int)
     from unnest($5::uuid[]) with ordinality as u(id, n)
     where u.id = h.id and h.importer_id = $1`,
    [identityId, FIRST_PLAYED, LAST_PLAYED, target, originals],
  );
  const started = Date.now();
  for (let from = originals.length; from < target; from += PER_BATCH) {
    const to = Math.min(target, from + PER_BATCH);
    await db.query('begin');
    await db.query(
      `create temp table m on commit drop as
       select s as seq, b.id as old_id, gen_random_uuid() as new_id
       from generate_series($1::int, $2::int - 1) s
       join base b on b.i = s % $3::int`,
      [from, to, cycle.length],
    );
    await db.query(
      `insert into hands (${handColumns.join(', ')})
       select ${handSelect} from m join hands h on h.id = m.old_id`,
      [FIRST_PLAYED, LAST_PLAYED, target],
    );
    await db.query(
      `insert into hand_facts (${facts.list})
       select ${facts.select} from m join hand_facts t on t.hand_id = m.old_id`,
    );
    await db.query(
      `insert into hand_stats (${stats.list})
       select ${stats.select} from m join hand_stats t on t.hand_id = m.old_id`,
    );
    await db.query(
      `insert into library_entries (identity_id, hand_id, added_at)
       select $1, m.new_id, now() from m`,
      [identityId],
    );
    await db.query('commit');
    console.log(`${to} Hands (${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
