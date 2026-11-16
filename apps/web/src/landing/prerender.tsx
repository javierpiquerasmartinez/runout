import { renderToString } from 'react-dom/server'
import { locales, messagesFor, type Locale } from '../i18n'
import type { Messages } from '../i18n/catalogue'
import { en } from '../i18n/messages/en'
import { es } from '../i18n/messages/es'
import { Root } from '../Root'
import { renderAt } from '../routing'
import { landingPaths } from './address'
import type { LandingDocument } from './captures'

/** What each language's document says of itself in its head is read from the whole catalogue, which only the build has to hand here. */
const heads: Record<Locale, Messages> = { es, en }

/**
 * The Landing as a Visitor's browser first draws it, in every language.
 * Called when the app is built, outside any browser: there is no session
 * there, so what the app shows is the Landing. Each is drawn with the
 * messages a Visitor's first load carries and no others, as the browser
 * draws it: one that needed more would fail here.
 */
export async function renderLandings(): Promise<LandingDocument<Locale>[]> {
  const landings: LandingDocument<Locale>[] = []
  for (const locale of locales) {
    const path = landingPaths[locale]
    await messagesFor(locale)
    renderAt(path)
    landings.push({
      locale,
      path,
      markup: renderToString(<Root locale={locale} />),
      title: heads[locale]['landing.head.title'],
      description: heads[locale]['landing.head.description'],
      pictureSays: heads[locale]['landing.head.picture'],
    })
  }
  return landings
}
