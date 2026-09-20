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

describe('time formatting', () => {
  it('formats a time of day the Spanish way', () => {
    const at = new Date('2026-09-19T21:05:07Z')
    expect(createTranslator('es').formatTime(at, { timeZone: 'UTC' })).toBe('21:05:07')
  })

  it('says how long ago something was, in its largest unit', () => {
    const now = new Date('2026-09-19T21:00:00Z')
    const ago = (ms: number) => new Date(now.getTime() - ms)
    const { formatRelative } = createTranslator('es')

    expect(formatRelative(ago(21 * 24 * 3_600_000), now)).toBe('hace 21 días')
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('hace 3 horas')
    expect(formatRelative(ago(90_000), now)).toBe('hace 1 minuto')
    expect(formatRelative(ago(800 * 24 * 3_600_000), now)).toBe('hace 2 años')
    // The language's own word wins where it has one.
    expect(formatRelative(ago(25 * 3_600_000), now)).toBe('ayer')
  })

  it('reads anything under a minute as now, never as a negative age', () => {
    const now = new Date('2026-09-19T21:00:00Z')
    expect(createTranslator('en').formatRelative(new Date(now.getTime() - 5_000), now)).toBe('this minute')
    expect(createTranslator('en').formatRelative(now, now)).toBe('this minute')
  })
})
