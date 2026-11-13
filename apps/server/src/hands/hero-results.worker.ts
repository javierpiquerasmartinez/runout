import { serveJobs } from '../workers/worker-pool.js';
import type { Hand } from './hand.js';
import { heroResult } from './replay/hero-result.js';

/** Works out the Hero's Result, All-in EV included, of each Hand of a job. */
serveJobs((hands: Hand[]) => hands.map(heroResult));
