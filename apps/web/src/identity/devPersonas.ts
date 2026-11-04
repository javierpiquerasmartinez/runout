/**
 * "Test mode": local development only. Signs in as a fixed test persona
 * without Google, against a server started with `DEV_SIGN_IN=true`.
 * `import.meta.env.DEV` is false in a build, so none of it ships.
 */
export const DEV_SIGN_IN = import.meta.env.DEV && import.meta.env.VITE_DEV_SIGN_IN === 'true'

/** The test personas: two, so a Room can have two people in it from two tabs. */
export const DEV_PERSONAS = ['tester-a', 'tester-b'] as const
export type DevPersona = (typeof DEV_PERSONAS)[number]

/** What the server's dev sign-in takes in place of Google's ID token. */
export function devSignInToken(persona: DevPersona): string {
  return `dev-sign-in|${persona}`
}
