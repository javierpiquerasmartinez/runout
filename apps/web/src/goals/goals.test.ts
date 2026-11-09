import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import { barFill, countdownOn, goalStatusOn, isValidCurrentValue, isValidTarget, orderGoals, progressOf, readCurrentValue, readGoalNumber, readTarget, writeGoalNumber } from './goals'
import type { Goal } from './goals'

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

describe('readGoalNumber', () => {
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
  ] as const)('reads, in %s, %s', (locale, text, value) => {
    expect(readGoalNumber(text, locale)).toBe(value)
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
    expect(readGoalNumber(text, locale)).toBeNull()
  })
})

describe('writeGoalNumber', () => {
  it.each([
    ['es', 12000, '12.000'],
    ['es', 5.5, '5,5'],
    ['es', 1234567.89, '1.234.567,89'],
    ['es', 0, '0'],
    ['en', 12000, '12,000'],
    ['en', 5.5, '5.5'],
    ['en', 1234567.89, '1,234,567.89'],
  ] as const)('writes, in %s, %d', (locale, value, text) => {
    expect(writeGoalNumber(value, createTranslator(locale).formatNumber)).toBe(text)
  })
})

describe.each([
  ['readTarget', readTarget],
  ['readCurrentValue', readCurrentValue],
] as const)('%s', (_name, read) => {
  it.each([
    ['es', '50.000', 50000],
    ['es', '5,5', 5.5],
    ['es', '5,50', 5.5],
    ['es', '12.000,75', 12000.75],
    ['en', '50,000', 50000],
    ['en', '5.50', 5.5],
    ['en', '999,999,999', 999999999],
  ] as const)('reads, in %s, %s', (locale, text, value) => {
    expect(read(text, locale)).toBe(value)
  })

  it.each([
    ['es', '50,000'],
    ['es', '5,500'],
    ['es', '5,555'],
    ['es', '12.000,750'],
    ['en', '50.000'],
    ['en', '5.500'],
    ['en', '5.555'],
    ['en', '12,000.750'],
  ] as const)('refuses, in %s, %s, by the decimals as typed', (locale, text) => {
    expect(read(text, locale)).toBeNull()
  })

  it.each([
    ['es', 'mucho'],
    ['es', '5.5'],
    ['es', '1.000.000.000'],
    ['en', '-5'],
    ['en', '1,000,000,000'],
  ] as const)('refuses, in %s, «%s»', (locale, text) => {
    expect(read(text, locale)).toBeNull()
  })
})

describe('readTarget', () => {
  it.each(['0', '0,00'])('refuses «%s», which is not above 0', (text) => {
    expect(readTarget(text, 'es')).toBeNull()
  })
})

describe('readCurrentValue', () => {
  it.each(['0', '0,00'])('reads «%s» as 0', (text) => {
    expect(readCurrentValue(text, 'es')).toBe(0)
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

describe('isValidCurrentValue', () => {
  it.each([0, 0.01, 5.55, 1234567.89, 999999999])('accepts %d', (value) => {
    expect(isValidCurrentValue(value)).toBe(true)
  })

  it.each([-1, -0.01, 5.555, 1e-7, 999999999.01, 1000000000])('refuses %d', (value) => {
    expect(isValidCurrentValue(value)).toBe(false)
  })
})

describe('goalStatusOn', () => {
  const period = { startDate: '2026-11-10', deadline: '2026-11-20', currentValue: 3, target: 10 }

  it.each([
    ['the day before the Start Date', '2026-11-09', 'notStarted'],
    ['the Start Date', '2026-11-10', 'inProgress'],
    ['a day of the period', '2026-11-15', 'inProgress'],
    ['the Deadline', '2026-11-20', 'inProgress'],
    ['the day after the Deadline', '2026-11-21', 'expired'],
  ] as const)('is decided by the dates on %s', (_, today, status) => {
    expect(goalStatusOn(period, today)).toBe(status)
  })

  it.each(['2026-11-09', '2026-11-15', '2026-11-21'])('is Achieved on %s once the Current Value reaches the Target', (today) => {
    expect(goalStatusOn({ ...period, currentValue: 10 }, today)).toBe('achieved')
    expect(goalStatusOn({ ...period, currentValue: 12.5 }, today)).toBe('achieved')
  })

  it('is not Achieved a hundredth short of the Target', () => {
    expect(goalStatusOn({ ...period, currentValue: 9.99 }, '2026-11-15')).toBe('inProgress')
  })
})

describe('countdownOn', () => {
  const period = { startDate: '2026-11-10', deadline: '2026-11-20', currentValue: 3, target: 10 }

  it('counts the days until a Goal that is Not Started begins', () => {
    expect(countdownOn(period, '2026-11-05')).toEqual({ kind: 'startsIn', days: 5 })
    expect(countdownOn(period, '2026-11-09')).toEqual({ kind: 'startsIn', days: 1 })
  })

  it('counts the days left of a Goal In Progress', () => {
    expect(countdownOn(period, '2026-11-10')).toEqual({ kind: 'daysLeft', days: 10 })
    expect(countdownOn(period, '2026-11-19')).toEqual({ kind: 'daysLeft', days: 1 })
  })

  it('calls the Deadline the last day', () => {
    expect(countdownOn(period, '2026-11-20')).toEqual({ kind: 'lastDay' })
  })

  it('counts the days since an Expired Goal ended', () => {
    expect(countdownOn(period, '2026-11-21')).toEqual({ kind: 'expiredAgo', days: 1 })
    expect(countdownOn(period, '2026-11-23')).toEqual({ kind: 'expiredAgo', days: 3 })
  })

  it('says nothing about time once a Goal is Achieved', () => {
    expect(countdownOn({ ...period, currentValue: 10 }, '2026-11-05')).toBeNull()
    expect(countdownOn({ ...period, currentValue: 10 }, '2026-11-15')).toBeNull()
    expect(countdownOn({ ...period, currentValue: 10 }, '2026-11-23')).toBeNull()
  })
})

describe('orderGoals', () => {
  const today = '2026-11-15'
  const goal = (id: string, details: Partial<Goal>): Goal => ({
    id,
    name: id,
    description: '',
    target: 10,
    currentValue: 3,
    startDate: '2026-11-01',
    deadline: '2026-11-30',
    createdAt: '2026-11-01T09:00:00.000Z',
    ...details,
  })
  const order = (goals: Goal[]) => orderGoals(goals, today).map(({ id }) => id)

  it('puts the soonest Deadline first among Goals Not Started and In Progress together', () => {
    expect(
      order([
        goal('in-december', { deadline: '2026-12-20' }),
        goal('starts-later', { startDate: '2026-11-20', deadline: '2026-11-25' }),
        goal('today', { deadline: '2026-11-15' }),
      ]),
    ).toEqual(['today', 'starts-later', 'in-december'])
  })

  it('puts the latest Deadline first among Goals Achieved and Expired together', () => {
    expect(
      order([
        goal('expired-long-ago', { deadline: '2026-11-02' }),
        goal('achieved-ahead', { currentValue: 10, deadline: '2026-12-31' }),
        goal('expired-lately', { deadline: '2026-11-14' }),
      ]),
    ).toEqual(['achieved-ahead', 'expired-lately', 'expired-long-ago'])
  })

  it('puts every open Goal before every Goal that is over', () => {
    expect(
      order([
        goal('achieved', { currentValue: 10, deadline: '2026-11-16' }),
        goal('open', { deadline: '2027-06-30' }),
        goal('expired', { deadline: '2026-11-14' }),
        goal('not-started', { startDate: '2027-01-01', deadline: '2027-07-01' }),
      ]),
    ).toEqual(['open', 'not-started', 'achieved', 'expired'])
  })

  it('breaks ties by creation, oldest first, in both groups', () => {
    const older = '2026-11-01T09:00:00.000Z'
    const newer = '2026-11-02T09:00:00.000Z'
    expect(
      order([
        goal('open-newer', { createdAt: newer }),
        goal('open-older', { createdAt: older }),
        goal('over-newer', { createdAt: newer, deadline: '2026-11-10' }),
        goal('over-older', { createdAt: older, deadline: '2026-11-10' }),
      ]),
    ).toEqual(['open-older', 'open-newer', 'over-older', 'over-newer'])
  })

  it('leaves the list it was given as it was', () => {
    const goals = [goal('later', { deadline: '2026-12-20' }), goal('sooner', { deadline: '2026-11-20' })]
    orderGoals(goals, today)
    expect(goals.map(({ id }) => id)).toEqual(['later', 'sooner'])
  })
})
