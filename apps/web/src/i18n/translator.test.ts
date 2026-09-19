import { describe, expect, it } from 'vitest'
import { createTranslator } from './translator'

describe('createTranslator', () => {
  it('reads messages from the Spanish catalogue', () => {
    const { t } = createTranslator('es')
    expect(t('design.buttons.createRoom')).toBe('Crear sala')
  })

  it('reads the same key from the English catalogue', () => {
    const { t } = createTranslator('en')
    expect(t('design.buttons.createRoom')).toBe('Create room')
  })

  it('fills {placeholders} from params', () => {
    expect(createTranslator('es').t('design.player.actionCounter', { current: 3, total: 11 })).toBe(
      'Acción 3 de 11',
    )
    expect(createTranslator('en').t('design.player.actionCounter', { current: 3, total: 11 })).toBe(
      'Action 3 of 11',
    )
  })
})

describe('locale formatting', () => {
  it('groups and separates decimals the Spanish way', () => {
    const { formatNumber } = createTranslator('es')
    expect(formatNumber(12345.5)).toBe('12.345,5')
  })

  it('groups and separates decimals the English way', () => {
    const { formatNumber } = createTranslator('en')
    expect(formatNumber(12345.5)).toBe('12,345.5')
  })

  it('formats an Amount in its currency following the locale', () => {
    expect(createTranslator('es').formatCurrency(12345.5, 'USD')).toBe('12.345,50 US$')
    expect(createTranslator('en').formatCurrency(12345.5, 'USD')).toBe('$12,345.50')
    expect(createTranslator('en').formatCurrency(0.25, 'EUR')).toBe('€0.25')
  })
})
