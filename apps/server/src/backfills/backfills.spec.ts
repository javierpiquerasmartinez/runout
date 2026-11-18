import type { Database } from '../database/database.js';
import { BACKFILLS, runBackfills, type Backfill } from './backfills.js';

const db = {} as Database;

describe('Backfills', () => {
  it('runs each backfill in order, reporting each as it finishes', async () => {
    const ran: string[] = [];
    const backfill = (name: string): Backfill => ({
      name,
      run: () => {
        ran.push(name);
        return Promise.resolve(`did ${name}`);
      },
    });
    const report: string[] = [];

    await runBackfills(db, (line) => report.push(line), [
      backfill('first'),
      backfill('second'),
    ]);

    expect(ran).toEqual(['first', 'second']);
    expect(report).toEqual([
      expect.stringMatching(/^first: did first \(\d+ ms\)$/),
      expect.stringMatching(/^second: did second \(\d+ ms\)$/),
    ]);
  });

  it('stops at the first backfill that fails, so the deploy fails', async () => {
    const later = vi.fn(() => Promise.resolve('done'));

    await expect(
      runBackfills(db, () => {}, [
        { name: 'broken', run: () => Promise.reject(new Error('no')) },
        { name: 'later', run: later },
      ]),
    ).rejects.toThrow('no');
    expect(later).not.toHaveBeenCalled();
  });

  it('has unique names', () => {
    const names = BACKFILLS.map((backfill) => backfill.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
