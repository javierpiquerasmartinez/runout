import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import { quantity } from './quantity'

const es = createTranslator('es')
const en = createTranslator('en')

describe('quantity', () => {
  it('writes an Amount in USDT, which has no ISO 4217 code, with its ₮ sign', () => {
    const usdt = { bigBlind: 10, currency: 'USDT' }

    expect(quantity(325, usdt, 'amount', es).primary).toBe('3,25 ₮')
    expect(quantity(325, usdt, 'amount', en).primary).toBe('₮3.25')
    expect(quantity(-40, usdt, 'both', en, { signDisplay: 'always' }).secondary).toBe('-₮0.40')
  })
})
