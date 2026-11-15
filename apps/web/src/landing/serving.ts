/*
 * Which document a path is served. The rules are `vercel.json`'s, which the
 * site is deployed with; `vite preview` serves the build by the same ones
 * (`build/landingDocuments.ts`). This module imports nothing, so the build's
 * own code can.
 */

/** One of `vercel.json`'s rules: a path that matches `source`, a pattern anchored at both ends, is served the file at `destination`. */
export interface Rewrite {
  source: string
  destination: string
}

/** The file a path that is no file of the build is served, by the first of `rewrites` it matches; null where none does, and the path is not found. */
export function documentAt(rewrites: Rewrite[], path: string): string | null {
  return rewrites.find(({ source }) => new RegExp(`^${source}$`).test(path))?.destination ?? null
}
