import { describe, expect, it } from 'vitest';
import { passwordProblem, waitAfterFailures } from './password-rules.js';

const common = new Set(['passwordpassword', 'qwertyuiopasdf']);

describe('password rules', () => {
  it('takes any 12 to 256 characters, spaces and symbols included', () => {
    expect(passwordProblem('a'.repeat(12), common)).toBeNull();
    expect(passwordProblem('correct horse battery', common)).toBeNull();
    expect(passwordProblem('ñandú 🃏 río!', common)).toBeNull();
    expect(passwordProblem('x'.repeat(256), common)).toBeNull();
  });

  it('refuses one shorter than 12 or longer than 256 characters', () => {
    expect(passwordProblem('a'.repeat(11), common)).toBe('too-short');
    expect(passwordProblem('', common)).toBe('too-short');
    expect(passwordProblem('x'.repeat(257), common)).toBe('too-long');
  });

  it('counts characters, not UTF-16 units', () => {
    // Eleven cards are eleven characters, though each takes two units.
    expect(passwordProblem('🃏'.repeat(11), common)).toBe('too-short');
  });

  it('refuses a common or leaked one, whatever its case', () => {
    expect(passwordProblem('passwordpassword', common)).toBe('common');
    expect(passwordProblem('PasswordPassword', common)).toBe('common');
  });

  it('asks for no particular mix of characters', () => {
    expect(passwordProblem('alllowercaseletters', common)).toBeNull();
  });
});

describe('failed attempts slowdown', () => {
  it('lets the first five failures go without a wait', () => {
    for (const failures of [0, 1, 2, 3, 4, 5]) {
      expect(waitAfterFailures(failures)).toBe(0);
    }
  });

  it('then waits 1, 5, 15 and 60 minutes, staying at 60', () => {
    const minute = 60_000;
    expect(waitAfterFailures(6)).toBe(minute);
    expect(waitAfterFailures(7)).toBe(5 * minute);
    expect(waitAfterFailures(8)).toBe(15 * minute);
    expect(waitAfterFailures(9)).toBe(60 * minute);
    expect(waitAfterFailures(40)).toBe(60 * minute);
  });
});
