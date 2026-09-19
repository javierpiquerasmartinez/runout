import { catalogues, type Locale, type MessageKey } from './catalogue'

export type MessageParams = Record<string, string | number>

/** The Intl locale each UI language formats numbers and dates with. */
const intlLocales: Record<Locale, string> = { es: 'es-ES', en: 'en-US' }

export type Translator = ReturnType<typeof createTranslator>

export function createTranslator(locale: Locale) {
  const messages = catalogues[locale]
  const intlLocale = intlLocales[locale]
  const numberFormat = new Intl.NumberFormat(intlLocale)

  return {
    locale,
    t: (key: MessageKey, params?: MessageParams) =>
      messages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        params && name in params ? String(params[name]) : placeholder,
      ),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      options ? new Intl.NumberFormat(intlLocale, options).format(value) : numberFormat.format(value),
    formatCurrency: (amount: number, currency: string) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(amount),
    formatTime: (date: Date, options?: Intl.DateTimeFormatOptions) =>
      date.toLocaleTimeString(intlLocale, options),
  }
}
