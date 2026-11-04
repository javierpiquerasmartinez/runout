import { readFileSync } from 'node:fs';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { Rejected } from '../rejection/rejection.js';
import { passwordProblem } from './password-rules.js';

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Node's built-in scrypt, at its recommended cost: no native dependency to build. */
const COST = { N: 16_384, r: 8, p: 1 };
const KEY_LENGTH = 64;

/** A password's hash, with its own salt and the cost it was made at: `scrypt$N$r$p$salt$key`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, COST);
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** Whether `password` is the one `stored` was made from, compared in constant time. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
    {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    },
  );
  return timingSafeEqual(actual, expected);
}

/**
 * A hash nobody's password matches, compared against when there is no
 * Account to check: a wrong email costs as long as a wrong password.
 */
export const NO_PASSWORD_HASH = await hashPassword(
  randomBytes(32).toString('base64'),
);

/**
 * The bundled list of common and leaked passwords, read once at start-up,
 * lower-cased so they are matched ignoring case.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0),
);

/** The password, when it follows the rules; `password-too-weak` otherwise. */
export function validPassword(raw: unknown): string {
  if (typeof raw !== 'string') throw new Rejected('password-too-weak');
  const problem = passwordProblem(raw, COMMON_PASSWORDS);
  if (problem) throw new Rejected('password-too-weak', { problem });
  return raw;
}
