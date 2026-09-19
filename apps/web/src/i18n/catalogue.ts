import { en } from './messages/en'
import { es } from './messages/es'

/** Spanish is the source catalogue: every other locale must provide the same keys. */
export type MessageKey = keyof typeof es
export type Messages = Record<MessageKey, string>

export const locales = ['es', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'es'

export const catalogues: Record<Locale, Messages> = { es, en }
