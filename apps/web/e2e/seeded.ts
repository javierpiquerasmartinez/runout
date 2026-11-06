/** Where Playwright runs the throwaway server and the Vite in front of it (see playwright.config.ts). */
export const SERVER_PORT = 3183
export const WEB_PORT = 5183
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`

/** The screens the replayer must fit without scrolling: a 13" laptop and around it. */
export const VIEWPORTS = [
  { name: '1440x760', width: 1440, height: 760 },
  { name: '1280x640', width: 1280, height: 640 },
  { name: '1000x620', width: 1000, height: 620 },
  { name: '1920x1000', width: 1920, height: 1000 },
  // Narrow and tall: the table spans the stage's whole width.
  { name: '1000x900', width: 1000, height: 900 },
] as const

/** What `seed.ts` left for the tests: Tester A's Library Hands, and a Room per viewport. */
export interface Seed {
  handIds: string[]
  rooms: Record<string, string>
}

export function seeded(): Seed {
  const json = process.env.RUNOUT_E2E_SEED
  if (!json) throw new Error('No seed: run the tests through playwright.config.ts')
  return JSON.parse(json) as Seed
}
