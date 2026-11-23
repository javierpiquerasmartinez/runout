import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_FOLDER } from './migrations-applied.js';

/**
 * The design canvas's "Data model" page says which migration it is up to date
 * to, and `docs/canvas-sync.json` records the same. A migration newer than
 * that one means the page is behind: regenerate it with `pnpm db:canvas` and
 * publish it (AGENTS.md, "Design").
 */
describe('The canvas data model page', () => {
  it('is up to date to the newest migration', () => {
    const newest = readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => /^\d{4}_.*\.sql$/.test(name))
      .sort()
      .at(-1)!
      .slice(0, 4);
    const stamp = JSON.parse(
      readFileSync(
        join(MIGRATIONS_FOLDER, '../../../docs/canvas-sync.json'),
        'utf8',
      ),
    ) as { dataModel: { migration: string } };

    expect(stamp.dataModel.migration).toBe(newest);
  });
});
