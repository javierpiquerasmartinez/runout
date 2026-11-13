import { WorkerPool } from './worker-pool.js';

describe('WorkerPool', () => {
  let pool: WorkerPool<number, { doubled: number }>;

  beforeEach(() => {
    pool = new WorkerPool(
      new URL('./worker-pool.fixture.js', import.meta.url),
      2,
    );
  });

  afterEach(async () => {
    await pool.close();
  });

  it('does each job in a thread of its own and answers each with its result', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => pool.run(n)));

    expect(results.map((result) => result.doubled)).toEqual([2, 4, 6, 8, 10]);
  });

  it('fails a job that throws, and goes on with the others', async () => {
    await expect(pool.run(-1)).rejects.toThrow('cannot double -1');

    expect(await pool.run(21)).toEqual({ doubled: 42 });
  });

  it('fails the job of a thread that dies, and goes on with the others', async () => {
    const [died, survived] = await Promise.allSettled([
      pool.run(0),
      pool.run(3),
    ]);

    expect(died.status).toBe('rejected');
    expect(survived).toEqual({ status: 'fulfilled', value: { doubled: 6 } });
    expect(await pool.run(4)).toEqual({ doubled: 8 });
  });

  it('takes no more jobs once closed, failing the ones still waiting', async () => {
    const waiting = Promise.allSettled([1, 2, 3, 4].map((n) => pool.run(n)));
    await pool.close();

    const settled = await waiting;
    expect(settled.some((job) => job.status === 'rejected')).toBe(true);
    await expect(pool.run(1)).rejects.toThrow('closed');
  });
});
