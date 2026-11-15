import { renderToString } from 'react-dom/server'
import { locales } from '../i18n'
import { Root } from '../Root'
import { renderAt } from '../routing'
import { landingPaths, type LandingDocument } from './address'

/**
 * The Landing as a Visitor's browser first draws it, in every language.
 * Called when the app is built, outside any browser: there is no session
 * there, so what the app shows is the Landing.
 */
export function renderLandings(): LandingDocument[] {
  return locales.map((locale) => {
    const path = landingPaths[locale]
    renderAt(path)
    return { locale, path, markup: renderToString(<Root locale={locale} />) }
  })
}
