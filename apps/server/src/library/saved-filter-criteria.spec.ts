import { describe, expect, it } from 'vitest';
import { Rejected } from '../rejection/rejection.js';
import {
  readSavedCriteria,
  savedCriteriaOf,
  storedCriteria,
} from './saved-filter-criteria.js';

describe('Saved Filter criteria', () => {
  it('keeps the fact criteria and the Stat criterion as the address writes them', () => {
    const criteria = savedCriteriaOf({
      facts: ['pot-type:3-bet,4-bet', '!hero-position:BB', 'players:..4'],
      stat: 'vpip:taken',
    });

    expect(criteria).toEqual({
      facts: ['pot-type:3-bet,4-bet', '!hero-position:BB', 'players:..4'],
      stat: 'vpip:taken',
    });
    expect(storedCriteria(criteria)).toEqual({
      format: 1,
      facts: ['pot-type:3-bet,4-bet', '!hero-position:BB', 'players:..4'],
      stat: 'vpip:taken',
    });
  });

  it('refuses criteria that are empty or not a Filter', () => {
    for (const raw of [
      null,
      { facts: [], stat: null },
      { facts: ['pot-type:7-bet'], stat: null },
      { facts: ['pot-type:3-bet'], stat: 'vpip' },
      { facts: 'pot-type:3-bet', stat: null },
      { facts: ['pot-type:3-bet'] },
    ]) {
      expect(() => savedCriteriaOf(raw)).toThrow(
        new Rejected('invalid-saved-filter-criteria'),
      );
    }
  });

  it('reads back what it stored', () => {
    const criteria = { facts: ['hero-position:BTN'], stat: null };

    expect(readSavedCriteria(storedCriteria(criteria))).toEqual({
      criteria,
      dropped: 0,
    });
  });

  it('drops, and counts, criteria on facts or Stats that no longer exist', () => {
    expect(
      readSavedCriteria({
        format: 1,
        facts: ['retired-fact:yes', 'hero-position:BTN', 'pot-type:9-bet'],
        stat: 'retired-stat:taken',
      }),
    ).toEqual({
      criteria: { facts: ['hero-position:BTN'], stat: null },
      dropped: 3,
    });
  });
});
