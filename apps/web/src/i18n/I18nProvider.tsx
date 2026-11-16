import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { defaultLocale, hasMessagesFor, messagesFor, type Locale } from './catalogue'
import { I18nContext } from './context'
import { createTranslator } from './translator'

/**
 * Speaks `initialLocale`, whose messages must be here already (`main.tsx`
 * waits for them), until `setLocale` is given another: at once where that
 * language's messages are here, and otherwise once they have arrived.
 */
export function I18nProvider({ initialLocale = defaultLocale, children }: { initialLocale?: Locale; children: ReactNode }) {
  const [locale, speak] = useState(initialLocale)
  /** The language last asked for: one asked for before it that arrives later is not switched to. */
  const wanted = useRef(initialLocale)
  const setLocale = useCallback((next: Locale) => {
    wanted.current = next
    if (hasMessagesFor(next)) return speak(next)
    messagesFor(next).then(
      () => wanted.current === next && speak(next),
      // Its messages didn't arrive: the language stays the one being read.
      () => {},
    )
  }, [])
  const i18n = useMemo(() => ({ ...createTranslator(locale), setLocale }), [locale, setLocale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <I18nContext value={i18n}>{children}</I18nContext>
}
