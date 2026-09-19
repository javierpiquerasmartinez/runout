import { createContext } from 'react'
import type { Locale } from './catalogue'
import type { Translator } from './translator'

export type I18n = Translator & { setLocale: (locale: Locale) => void }

export const I18nContext = createContext<I18n | null>(null)
