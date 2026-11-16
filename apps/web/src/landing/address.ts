import { defaultLocale, type Locale } from '../i18n/catalogue'

/**
 * The Landing's address in each language. Each is a document of its own,
 * with the copy already in it (see `build/landingDocuments.ts`), so the
 * language is the address's and not the browser's or anyone's Preference.
 */
export const landingPaths: Record<Locale, string> = { es: '/', en: '/en' }

/** The language the Landing speaks at `path`: its own address's, and Spanish at `/` and at any path that leads nowhere. */
export function landingLocaleAt(path: string): Locale {
  const address = path.replace(/(.)\/$/, '$1')
  return (Object.keys(landingPaths) as Locale[]).find((locale) => landingPaths[locale] === address) ?? defaultLocale
}
