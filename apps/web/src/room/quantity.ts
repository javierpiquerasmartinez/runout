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
  /** ISO 4217, e.g. "EUR", or the ticker of a currency without one ("USDT"). */
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
  return quantityOf(amount / scale.bigBlind, { amount, currency: scale.currency }, unit, i18n, options)
}

/**
 * The same for what is already counted in both units, as a sum over Hands of
 * different Stakes is. Without an Amount, because the Hands mix currencies, it
 * stays in big blinds whatever the unit.
 */
export function quantityOf(
  bigBlinds: number,
  money: { amount: number; currency: string } | null,
  unit: DisplayUnit,
  i18n: Translator,
  options?: Intl.NumberFormatOptions,
): Quantity {
  // An Amount in its currency, the way the UI language writes money: "0,65 €", "€0.65".
  const written = money && i18n.formatCurrency(money.amount / 100, money.currency, { signDisplay: options?.signDisplay })
  if (unit === 'amount' && written !== null) return { primary: written, secondary: null }
  const primary = i18n.t('room.table.bigBlinds', {
    value: i18n.formatNumber(bigBlinds, { maximumFractionDigits: 1, ...options }),
  })
  return { primary, secondary: unit === 'both' ? written : null }
}
