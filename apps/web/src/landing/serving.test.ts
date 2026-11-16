import { describe, expect, it } from 'vitest'
import rules from '../../vercel.json?raw'
import { locales } from '../i18n'
import { landingPaths } from './address'
import { documentAt, type Rewrite } from './serving'

/*
 * Which document each path is served, by the rules in `vercel.json`: the
 * ones the site is deployed with, and the ones `vite preview` serves the
 * build by (`build/landingDocuments.ts`). A path no file answers and no rule rewrites is not found.
 */

const { rewrites } = JSON.parse(rules) as { rewrites: Rewrite[] }
const served = (path: string) => documentAt(rewrites, path)

describe('the document a path is served', () => {
  it.each(locales)('is the Landing\'s own in "%s" at its address', (locale) => {
    const path = landingPaths[locale]
    expect(served(path)).toBe(path === '/' ? '/index.html' : `${path}/index.html`)
  })

  it('is the app at every other path', () => {
    for (const path of ['/login', '/library', '/room/ABCDEF', '/english', '/en/library', '/no-such-place']) {
      expect(served(path), path).toBe('/app.html')
    }
  })

  // A tab left open across a deploy asks for chunks that are gone: answered with the app's document, the browser
  // would take it for the script and fail on it; answered as not found, the app reloads (`routes/recovery`).
  it("is none for a file of the build that isn't there: it is not found, not the app", () => {
    expect(served('/assets/LibraryPage-0ld.js')).toBeNull()
    expect(served('/assets/index-0ld.css')).toBeNull()
  })
})
