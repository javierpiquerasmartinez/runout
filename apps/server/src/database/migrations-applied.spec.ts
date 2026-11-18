import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  MIGRATIONS_FOLDER,
  newestMigration,
  waitForMigrations,
} from './migrations-applied.js';

/** A clock that moves only when the wait sleeps. */
function fakeTime() {
  let at = 0;
  return {
    now: () => at,
    sleep: (ms: number) => {
      at += ms;
      return Promise.resolve();
    },
  };
}

describe('Waiting for migrations', () => {
  it('starts at once, saying nothing, when they are already applied', async () => {
    const report = vi.fn();
    const applied = vi.fn(() => Promise.resolve(true));

    await waitForMigrations({ applied, report, ...fakeTime() });

    expect(applied).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it('checks again until they are, then says how long it waited', async () => {
    const answers = [false, false, true];
    const report: string[] = [];

    await waitForMigrations({
      applied: () => Promise.resolve(answers.shift()!),
      report: (line) => report.push(line),
      everyMs: 5_000,
      ...fakeTime(),
    });

    expect(answers).toEqual([]);
    expect(report).toEqual([
      expect.stringMatching(/^Waiting for the database/),
      'Migrations applied after 10000 ms; starting.',
    ]);
  });

  it('gives up once the time is out, so the service does not start', async () => {
    const applied = vi.fn(() => Promise.resolve(false));

    await expect(
      waitForMigrations({
        applied,
        report: () => {},
        everyMs: 5_000,
        timeoutMs: 60_000,
        ...fakeTime(),
      }),
    ).rejects.toThrow(/still lacks migrations/);
    // Once at first, then once every 5 s for the minute.
    expect(applied).toHaveBeenCalledTimes(13);
  });

  it('knows the newest migration of the build from the migrations folder', () => {
    const migrations = readMigrationFiles({
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    expect(migrations.length).toBeGreaterThan(0);
    expect(newestMigration()).toBe(migrations.at(-1)!.folderMillis);
  });
});
