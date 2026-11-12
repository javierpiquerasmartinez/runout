import { serveJobs } from './worker-pool.js';

/** A worker for the pool's tests: doubles a number, throws on a negative one, dies on 0. */
serveJobs((input: number) => {
  if (input === 0) process.exit(1);
  if (input < 0) throw new Error(`cannot double ${input}`);
  return { doubled: input * 2 };
});
