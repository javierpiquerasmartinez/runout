import { parentPort, Worker } from 'node:worker_threads';

/*
 * Work that would block the event loop, done in threads of its own: a Room
 * keeps playing while someone's import works out All-in EV.
 */

/** What a worker answers each job with. */
type Answer<Out> = { ok: true; value: Out } | { ok: false; error: string };

interface Job<In, Out> {
  input: In;
  resolve: (value: Out) => void;
  reject: (error: Error) => void;
}

/**
 * What every worker runs first, then imports its `entry`. Run from the
 * TypeScript sources, as the tests do, a module (or `entry` itself) names
 * `./x.js` where only `x.ts` exists: this resolves it to the `.ts`, which
 * Node strips the types of. Built, every `.js` exists and nothing changes.
 */
const BOOTSTRAP = `
const { registerHooks } = require('node:module');
const { workerData } = require('node:worker_threads');
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        error?.code !== 'ERR_MODULE_NOT_FOUND' ||
        !/^(\\.\\.?\\/|file:)/.test(specifier) ||
        !specifier.endsWith('.js')
      ) {
        throw error;
      }
      return next(specifier.slice(0, -3) + '.ts', context);
    }
  },
});
import(workerData.entry);
`;

/**
 * A fixed number of threads, each running the module at `entry` (which calls
 * `serveJobs`), taking one job at a time in the order they come. Threads are
 * started when first needed, and one that dies fails its job and is replaced
 * by the next job. They never keep the process alive on their own.
 */
export class WorkerPool<In, Out> {
  private readonly idle: Worker[] = [];
  private readonly busy = new Map<Worker, Job<In, Out>>();
  private readonly waiting: Job<In, Out>[] = [];
  private started = 0;
  private closed = false;
  // Plain fields, not parameter properties: a worker loads this module with
  // its types stripped, which cannot do those.
  private readonly entry: URL;
  private readonly size: number;

  constructor(entry: URL, size: number) {
    this.entry = entry;
    this.size = size;
  }

  /** Does `input` in a thread; fails if the job throws or its thread dies. */
  run(input: In): Promise<Out> {
    if (this.closed) return Promise.reject(new Error('The pool is closed'));
    return new Promise<Out>((resolve, reject) => {
      this.waiting.push({ input, resolve, reject });
      this.next();
    });
  }

  /** Ends every thread; jobs not finished yet fail. */
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.waiting.splice(0)) {
      job.reject(new Error('The pool is closed'));
    }
    const workers = [...this.idle.splice(0), ...this.busy.keys()];
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  private next(): void {
    while (this.waiting.length > 0) {
      const worker = this.idle.pop() ?? this.start();
      if (!worker) return;
      const job = this.waiting.shift()!;
      this.busy.set(worker, job);
      worker.postMessage(job.input);
    }
  }

  private start(): Worker | undefined {
    if (this.started >= this.size) return undefined;
    this.started++;
    const worker = new Worker(BOOTSTRAP, {
      eval: true,
      workerData: { entry: this.entry.href },
    });
    worker.unref();
    worker.on('message', (answer: Answer<Out>) => {
      const job = this.busy.get(worker);
      if (!job) return;
      this.busy.delete(worker);
      if (answer.ok) job.resolve(answer.value);
      else job.reject(new Error(answer.error));
      if (this.closed) return;
      this.idle.push(worker);
      this.next();
    });
    const lost = (error: Error) => {
      const job = this.busy.get(worker);
      if (!this.busy.delete(worker)) {
        const index = this.idle.indexOf(worker);
        if (index === -1) return;
        this.idle.splice(index, 1);
      }
      this.started--;
      job?.reject(error);
      if (!this.closed) this.next();
    };
    worker.on('error', lost);
    worker.on('exit', (code) =>
      lost(new Error(`A worker stopped with exit code ${code}`)),
    );
    return worker;
  }
}

/**
 * Inside a worker started by a `WorkerPool`: answers each job with what
 * `work` returns for it, or with the error it throws.
 */
export function serveJobs<In, Out>(work: (input: In) => Out): void {
  const port = parentPort;
  if (!port) throw new Error('serveJobs runs inside a worker');
  port.on('message', (input: In) => {
    let answer: Answer<Out>;
    try {
      answer = { ok: true, value: work(input) };
    } catch (error) {
      answer = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    port.postMessage(answer);
  });
}
