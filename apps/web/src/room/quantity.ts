import type { Translator } from '../i18n/translator'
import type { DisplayUnit } from '../preferences/preferences'

/*
 * How much something is, in the reader's Display Unit. Every Amount the
 * server sends is an integer in hundredths of the Hand's currency.
 */

export interface Quantity {
  /** In big blinds or as an Amount, whichever the reader reads first: "6,5 BB", "0,65 €". */
  primary: string
  /** The Amount beside big blinds, when the reader shows both, to be drawn dimmed. */
  secondary: string | null
}

/** The part of a Stake a quantity is read against. */
export interface Scale {
  bigBlind: number
  /** ISO 4217, e.g. "EUR". */
  currency: string
}

export function quantity(
  amount: number,
  scale: Scale,
  unit: DisplayUnit,
  i18n: Translator,
  /** For the big blinds: digits, sign. The Amount keeps its currency's digits. */
  options?: Intl.NumberFormatOptions,
): Quantity {
  // An Amount in the Hand's currency, the way the UI language writes money: "0,65 €", "€0.65".
  const money = () => i18n.formatCurrency(amount / 100, scale.currency, { signDisplay: options?.signDisplay })
  if (unit === 'amount') return { primary: money(), secondary: null }
  const bigBlinds = i18n.t('room.table.bigBlinds', {
    value: i18n.formatNumber(amount / scale.bigBlind, { maximumFractionDigits: 1, ...options }),
  })
  return { primary: bigBlinds, secondary: unit === 'both' ? money() : null }
}
