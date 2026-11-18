import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { handFacts } from '../database/schema.js';
import { FACT_KEYS, factOnRow } from './fact-criteria.js';

describe('The facts a criterion can name', () => {
  it('reads every fact of the facts row from one of its columns', () => {
    const columns = new Set(Object.values(getTableColumns(handFacts)));
    // The Hand's own columns (the Result, Reached Showdown) are not on it.
    const onRow = FACT_KEYS.filter((fact) => {
      try {
        factOnRow(fact);
        return true;
      } catch {
        return false;
      }
    });

    expect(onRow.length).toBeGreaterThan(200);
    expect(
      onRow.filter((fact) => !columns.has(factOnRow(fact).column)),
    ).toEqual([]);
  });
});
