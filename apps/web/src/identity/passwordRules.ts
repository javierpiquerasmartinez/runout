import { api } from '../backend/api'

/*
 * The password rules as the server applies them (ADR 0008): 12 to 256
 * characters, any at all, and none of the common or leaked ones. The web
 * checks the length itself and asks the server about the rest; the server is
 * the one that decides on submit.
 */

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 256

export type PasswordProblem = 'too-short' | 'too-long' | 'common'

/** What the length alone says, counted in Unicode code points as the server does. */
export function lengthProblem(password: string): PasswordProblem | null {
  // oxlint-disable-next-line typescript/no-misused-spread
  const length = [...password].length
  if (length < PASSWORD_MIN_LENGTH) return 'too-short'
  if (length > PASSWORD_MAX_LENGTH) return 'too-long'
  return null
}

/** Asks the server whether a password follows every rule, the bundled list included. */
export async function checkPassword(password: string): Promise<PasswordProblem | null> {
  const { problem } = await api<{ problem: PasswordProblem | null }>('/password-checks', {
    method: 'POST',
    body: { password },
  })
  return problem
}
