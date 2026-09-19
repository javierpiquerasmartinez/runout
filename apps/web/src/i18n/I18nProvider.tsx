import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { defaultLocale, type Locale } from './catalogue'
import { I18nContext } from './context'
import { createTranslator } from './translator'

export function I18nProvider({ initialLocale = defaultLocale, children }: { initialLocale?: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale)
  const i18n = useMemo(() => ({ ...createTranslator(locale), setLocale }), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <I18nContext value={i18n}>{children}</I18nContext>
}
