import { describe, expect, it } from 'vitest'
import document from '../../index.html?raw'
import { locales } from '../i18n'
import { ACCOUNT_KEY, LANGUAGE_KEY } from '../identity/identity'
import { landingPaths } from './address'
import { firstDraw } from './firstDraw'

/*
 * What happens to the Landing a document holds before the app draws
 * anything. The script in the document's head runs before first paint and
 * can import nothing: it is run here as it is written in `index.html`,
 * against the storage keys and addresses the app's own modules go by, so one
 * that drifts from them fails here.
 */

const script = /<script>([\s\S]*?)<\/script>/.exec(document)![1]
const visitor = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** Runs the head's script in a browser that asks for `languages`, at `address`, with `stored` in its storage. */
function beforeFirstPaint({
  address = '/',
  languages = ['es-ES'],
  stored = {},
  userAgent = visitor,
}: { address?: string; languages?: string[]; stored?: Record<string, string>; userAgent?: string } = {}) {
  const at = new URL(address, 'https://runout.test')
  const page = { dataset: {} as { landing?: string } }
  let taken: string | null = null
  new Function('document', 'localStorage', 'navigator', 'location', script)(
    { documentElement: page },
    { getItem: (key: string) => stored[key] ?? null },
    { languages, language: languages[0], userAgent },
    { pathname: at.pathname, search: at.search, hash: at.hash, replace: (to: string) => (taken = to) },
  )
  return { landing: page.dataset.landing, taken }
}

const untouched = { landing: undefined, taken: null }

describe("the script in the document's head", () => {
  it('leaves a Visitor who reads Spanish the Landing at /', () => {
    expect(beforeFirstPaint()).toEqual(untouched)
  })

  it("keeps the Landing out of sight of a browser that holds an Account's session, at either address", () => {
    for (const address of Object.values(landingPaths)) {
      expect(beforeFirstPaint({ address, languages: ['en-US'], stored: { [ACCOUNT_KEY]: '1' } })).toEqual({ landing: 'hidden', taken: null })
    }
  })

  it('shows an anonymous identity the Landing, as it does any Visitor', () => {
    expect(beforeFirstPaint({ stored: { 'runout.identityToken': 'a-guest-token' } })).toEqual(untouched)
  })

  it.each(locales.filter((locale) => landingPaths[locale] !== '/'))(
    'takes a Visitor whose browser asks for "%s" to the Landing in it, showing nothing meanwhile',
    (locale) => {
      expect(beforeFirstPaint({ address: '/?from=a-friend#top', languages: [`${locale}-XX`, 'es'] })).toEqual({
        landing: 'leaving',
        taken: `${landingPaths[locale]}?from=a-friend#top`,
      })
    },
  )

  it('goes by the language an identity last read in here, over what the browser asks for', () => {
    expect(beforeFirstPaint({ languages: ['en-US'], stored: { [LANGUAGE_KEY]: 'es' } })).toEqual(untouched)
    expect(beforeFirstPaint({ languages: ['es-ES'], stored: { [LANGUAGE_KEY]: 'en' } }).taken).toBe(landingPaths.en)
  })

  it('takes nobody anywhere from an address that is not /', () => {
    expect(beforeFirstPaint({ address: landingPaths.en, languages: ['en-US'] })).toEqual(untouched)
    expect(beforeFirstPaint({ address: '/library', languages: ['en-US'] })).toEqual(untouched)
  })

  it('leaves a crawler where it is', () => {
    const crawler = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    expect(beforeFirstPaint({ languages: ['en-US'], userAgent: crawler })).toEqual(untouched)
  })
})

describe("the app's first draw", () => {
  const visitorAtLanding = { leaving: false, landingInDocument: true, holdsSession: false, holdsAccount: false }

  it('draws nothing while the browser is being taken to the Landing in another language', () => {
    expect(firstDraw({ ...visitorAtLanding, leaving: true })).toBe('nothing')
  })

  it('takes over the Landing in the document for a Visitor, as its own', () => {
    expect(firstDraw(visitorAtLanding)).toBe('take-over')
  })

  it('keeps the Landing in the document on screen for an anonymous identity until the server has said whose the token is', () => {
    expect(firstDraw({ ...visitorAtLanding, holdsSession: true })).toBe('once-recognised')
  })

  it('draws afresh for an Account, whose Landing was never shown', () => {
    expect(firstDraw({ ...visitorAtLanding, holdsSession: true, holdsAccount: true })).toBe('afresh')
  })

  it('draws afresh where the document holds no Landing', () => {
    expect(firstDraw({ ...visitorAtLanding, landingInDocument: false })).toBe('afresh')
    expect(firstDraw({ ...visitorAtLanding, landingInDocument: false, holdsSession: true })).toBe('afresh')
  })
})
