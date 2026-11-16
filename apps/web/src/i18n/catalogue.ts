import { held } from './held'
import type { es } from './messages/es'

/** Spanish is the source catalogue: every other locale must provide the same keys. */
export type MessageKey = keyof typeof es
export type Messages = Record<MessageKey, string>

export const locales = ['es', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'es'

/*
 * The messages arrive as they are needed, a language at a time, so a
 * Visitor's first load carries the Landing's in one language and not the
 * whole catalogue in both. Each language comes in two parts: the first
 * load's (`messages/first`), and the whole of it, which every screen but
 * the Landing waits for (`wholeCatalogue`). A language is switched to only
 * once its messages are here (`I18nProvider`).
 */
type Part = 'first' | 'whole'

const parts: Record<Part, Record<Locale, () => Promise<Partial<Messages>>>> = {
  first: {
    es: () => import('./messages/first/es').then((module) => module.es),
    en: () => import('./messages/first/en').then((module) => module.en),
  },
  whole: {
    es: () => import('./messages/es').then((module) => module.es),
    en: () => import('./messages/en').then((module) => module.en),
  },
}

/** The messages that have arrived, by language. */
const arrived: Record<Locale, Partial<Messages>> = { es: { ...held.es }, en: { ...held.en } }
const here: Record<Part, Set<Locale>> = {
  first: new Set(Object.keys(held) as Locale[]),
  whole: new Set(Object.keys(held) as Locale[]),
}
const arriving = new Map<string, Promise<void>>()

/** How much of a language is needed: the first load's until any screen but the Landing has been asked for, the whole of it from then on. */
let needed: Part = 'first'
/** The languages asked for so far. */
const asked = new Set<Locale>()

function arrive(locale: Locale, part: Part): Promise<void> {
  if (here[part].has(locale)) return Promise.resolve()
  const name = `${part} ${locale}`
  let loading = arriving.get(name)
  if (!loading) {
    loading = parts[part][locale]().then(
      (messages) => {
        Object.assign(arrived[locale], messages)
        here[part].add(locale)
        // The whole holds the first load's too.
        if (part === 'whole') here.first.add(locale)
      },
      (error: unknown) => {
        // Asked for again the next time, not remembered as failed.
        arriving.delete(name)
        throw error
      },
    )
    arriving.set(name, loading)
  }
  return loading
}

/** The messages of a language that have arrived: the same object as more of them do. */
export function messagesOf(locale: Locale): Partial<Messages> {
  return arrived[locale]
}

/** Whether as much of a language as is needed now is here, and it can be spoken at once. */
export function hasMessagesFor(locale: Locale): boolean {
  return here[needed].has(locale)
}

/** Asks for a language, and settles once as much of it as is needed now has arrived. */
export function messagesFor(locale: Locale): Promise<void> {
  asked.add(locale)
  return arrive(locale, needed)
}

/**
 * Asks for the whole catalogue, in every language asked for so far, and
 * settles once it has arrived. Every screen but the Landing waits for it
 * (`routes/pages`), and so does the app before it shows anything to an
 * identity (`identity/SessionProvider`).
 */
export async function wholeCatalogue(): Promise<void> {
  needed = 'whole'
  await Promise.all([...asked].map((locale) => arrive(locale, 'whole')))
}

/** Whether the whole catalogue is here, in every language asked for so far. */
export function hasWholeCatalogue(): boolean {
  return [...asked].every((locale) => here.whole.has(locale))
}
