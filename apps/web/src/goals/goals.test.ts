import { describe, expect, it } from 'vitest'
import { barFill, isValidTarget, progressOf, readAmount, writeAmount } from './goals'

describe('progressOf', () => {
  it('is 0 at the start', () => {
    expect(progressOf({ currentValue: 0, target: 50000 })).toBe(0)
  })

  it('rounds down to a whole percentage', () => {
    expect(progressOf({ currentValue: 1, target: 3 })).toBe(33)
    expect(progressOf({ currentValue: 2, target: 3 })).toBe(66)
  })

  it('never reads 100 just below the Target', () => {
    expect(progressOf({ currentValue: 99.6, target: 100 })).toBe(99)
    expect(progressOf({ currentValue: 999999998.99, target: 999999999 })).toBe(99)
  })

  it('is exactly 100 at the Target', () => {
    expect(progressOf({ currentValue: 60, target: 60 })).toBe(100)
  })

  it('goes past 100 with no limit', () => {
    expect(progressOf({ currentValue: 120, target: 100 })).toBe(120)
    expect(progressOf({ currentValue: 999999999, target: 0.01 })).toBe(9999999990000)
  })

  it('is not moved by floating-point error', () => {
    // 0.07 / 0.1 is 0.7000000000000001 and 4.35 * 100 is 434.99999999999994.
    expect(progressOf({ currentValue: 0.07, target: 0.1 })).toBe(70)
    expect(progressOf({ currentValue: 4.35, target: 5 })).toBe(87)
    expect(progressOf({ currentValue: 1.1, target: 1.1 })).toBe(100)
    expect(progressOf({ currentValue: 0.29, target: 1 })).toBe(29)
    expect(progressOf({ currentValue: 0.57, target: 1 })).toBe(57)
    expect(progressOf({ currentValue: 1.15, target: 1 })).toBe(115)
  })
})

describe('barFill', () => {
  it('follows the Progress up to 100', () => {
    expect(barFill({ currentValue: 42, target: 60 })).toBe(70)
    expect(barFill({ currentValue: 60, target: 60 })).toBe(100)
  })

  it('stops at 100 past the Target', () => {
    expect(barFill({ currentValue: 120, target: 100 })).toBe(100)
  })
})

describe('readAmount', () => {
  it.each([
    ['es', '5,5', 5.5],
    ['es', '12.000', 12000],
    ['es', '12.000,75', 12000.75],
    ['es', '999.999.999', 999999999],
    ['es', '50000', 50000],
    ['es', ' 7 ', 7],
    ['en', '5.5', 5.5],
    ['en', '12,000', 12000],
    ['en', '12,000.75', 12000.75],
    ['en', '50000', 50000],
  ] as const)('reads, in %s, %s', (locale, text, amount) => {
    expect(readAmount(text, locale)).toBe(amount)
  })

  it.each([
    ['es', ''],
    ['es', '   '],
    ['es', 'mucho'],
    ['es', '-5'],
    ['es', '1e3'],
    ['es', '5,'],
    ['es', ',5'],
    ['es', '5.5'],
    ['es', '12.00'],
    ['es', '1,2,3'],
    ['en', '5,5'],
    ['en', '12,00'],
    ['en', '1.2.3'],
  ] as const)("doesn't read, in %s, «%s»", (locale, text) => {
    expect(readAmount(text, locale)).toBeNull()
  })
})

describe('writeAmount', () => {
  it.each([
    ['es', 12000, '12.000'],
    ['es', 5.5, '5,5'],
    ['es', 1234567.89, '1.234.567,89'],
    ['es', 0, '0'],
    ['en', 12000, '12,000'],
    ['en', 5.5, '5.5'],
    ['en', 1234567.89, '1,234,567.89'],
  ] as const)('writes, in %s, %d', (locale, amount, text) => {
    expect(writeAmount(amount, locale)).toBe(text)
  })
})

describe('isValidTarget', () => {
  it.each([0.01, 5.55, 50000, 999999999])('accepts %d', (target) => {
    expect(isValidTarget(target)).toBe(true)
  })

  it.each([0, -1, 5.555, 1e-7, 999999999.01, 1000000000])('refuses %d', (target) => {
    expect(isValidTarget(target)).toBe(false)
  })
})
