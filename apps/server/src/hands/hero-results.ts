import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { WorkerPool } from '../workers/worker-pool.js';
import type { Hand } from './hand.js';
import type { HeroResult } from './replay/hero-result.js';

/** How many threads work out All-in EV, for every import alike. */
const THREADS = 2;

/** Hands per job: small enough that both threads share a batch's all-ins. */
const HANDS_PER_JOB = 25;

/**
 * The Hero's Result of each Hand, All-in EV included, worked out off the
 * main thread so that an all-in's exact enumeration never stalls a Room.
 * Every import path goes through this one pool; only the offline
 * `reread-hands` script still works it out on its own thread.
 */
@Injectable()
export class HeroResults implements OnModuleDestroy {
  private readonly pool = new WorkerPool<Hand[], HeroResult[]>(
    new URL('./hero-results.worker.js', import.meta.url),
    THREADS,
  );

  /** Each Hand's Hero Result, in order. Fails if a thread fails. */
  async of(hands: readonly Hand[]): Promise<HeroResult[]> {
    const jobs: Promise<HeroResult[]>[] = [];
    for (let start = 0; start < hands.length; start += HANDS_PER_JOB) {
      jobs.push(this.pool.run(hands.slice(start, start + HANDS_PER_JOB)));
    }
    return (await Promise.all(jobs)).flat();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.close();
  }
}
