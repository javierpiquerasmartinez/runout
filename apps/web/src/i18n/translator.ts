import { catalogues, type Locale, type MessageKey } from './catalogue'

export type MessageParams = Record<string, string | number>

/** The Intl locale each UI language formats numbers and dates with. */
const intlLocales: Record<Locale, string> = { es: 'es-ES', en: 'en-US' }

export type Translator = ReturnType<typeof createTranslator>

export function createTranslator(locale: Locale) {
  const messages = catalogues[locale]
  const intlLocale = intlLocales[locale]
  const numberFormat = new Intl.NumberFormat(intlLocale)
  const listFormat = new Intl.ListFormat(intlLocale, { type: 'conjunction' })
  const relativeFormat = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' })

  return {
    locale,
    t: (key: MessageKey, params?: MessageParams) =>
      messages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        params && name in params ? String(params[name]) : placeholder,
      ),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      options ? new Intl.NumberFormat(intlLocale, options).format(value) : numberFormat.format(value),
    formatCurrency: (amount: number, currency: string, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency, ...options }).format(amount),
    formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) =>
      date.toLocaleDateString(intlLocale, options),
    formatTime: (date: Date, options?: Intl.DateTimeFormatOptions) =>
      date.toLocaleTimeString(intlLocale, options),
    /** "Marta y Alberto": names joined the way the language does it. */
    formatList: (items: string[]) => listFormat.format(items),
    /** "hace 21 días", "21 days ago": how long ago an instant was, in its largest unit. */
    formatRelative: (date: Date, now: Date = new Date()) => {
      const { amount, unit } = relativeUnit(date.getTime() - now.getTime())
      return relativeFormat.format(amount, unit)
    },
  }
}

/** Rounded steps, largest first: the unit a span of time is best read in. */
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3_600_000],
  ['month', 30 * 24 * 3_600_000],
  ['day', 24 * 3_600_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * How to say a span of milliseconds: the largest unit it fills at least once,
 * down to minutes, and 0 minutes ("ahora") for anything shorter.
 */
function relativeUnit(elapsedMs: number): {
  amount: number
  unit: Intl.RelativeTimeFormatUnit
} {
  const span = Math.abs(elapsedMs)
  for (const [unit, size] of RELATIVE_UNITS) {
    if (span >= size) {
      return { amount: Math.trunc(elapsedMs / size), unit }
    }
  }
  return { amount: 0, unit: 'minute' }
}
