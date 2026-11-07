import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  dayOfMonth,
  intlDate,
  calendarPath,
  cellMilestones,
  isCalendarPath,
  isPending,
  mondayOf,
  monthGrid,
  nextPeriod,
  orderDay,
  parseDate,
  periodFromPath,
  periodPath,
  periodSpan,
  previousPeriod,
  todayOf,
  todayPeriod,
  weekDays,
  type Milestone,
  type Period,
} from './calendar'

/** The month grid's dates, one row of seven per week, with the month's own days marked `*`. */
function gridOf(year: number, month: number): string[][] {
  return monthGrid({ year, month }).map((week) => week.map(({ date, inMonth }) => (inMonth ? `${date}*` : date)))
}

const month = (year: number, month: number): Period => ({ view: 'month', month: { year, month } })
const week = (monday: string): Period => ({ view: 'week', monday })

describe('calendar dates', () => {
  it('read real dates written YYYY-MM-DD and nothing else', () => {
    expect(parseDate('2026-11-07')).toBe('2026-11-07')
    expect(parseDate('2028-02-29')).toBe('2028-02-29')
    for (const text of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-11-7', '07/11/2026', '', '2026-11-07T00:00']) {
      expect(parseDate(text)).toBeNull()
    }
  })

  it('add and take away days across months, years and February', () => {
    expect(addDays('2026-11-07', 1)).toBe('2026-11-08')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-11-07', -7)).toBe('2026-10-31')
  })

  it('say their day of the month', () => {
    expect(dayOfMonth('2026-11-07')).toBe(7)
    expect(dayOfMonth('2026-11-30')).toBe(30)
  })

  it('become the UTC midnight Intl formats in UTC', () => {
    expect(intlDate('2026-11-07').toISOString()).toBe('2026-11-07T00:00:00.000Z')
  })

  it('take today from the local clock', () => {
    expect(todayOf(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07')
    expect(todayOf(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })
})

describe('across a daylight-saving change', () => {
  // Madrid moves its clocks on 29 March and 25 October 2026.
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Madrid')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('never moves a day', () => {
    // The zone took: the clocks do change in it.
    expect(new Date(2026, 2, 28, 12).getTimezoneOffset()).not.toBe(new Date(2026, 2, 30, 12).getTimezoneOffset())
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-10-26', -1)).toBe('2026-10-25')
    expect(mondayOf('2026-03-29')).toBe('2026-03-23')
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
    expect(weekDays('2026-10-19')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })

  it('takes today right on the night the clocks change', () => {
    expect(todayOf(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29')
    expect(todayOf(new Date(2026, 2, 29, 23, 30))).toBe('2026-03-29')
    expect(todayOf(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25')
    expect(todayOf(new Date(2026, 9, 25, 23, 30))).toBe('2026-10-25')
  })

  it('walks a whole year one day at a time without skipping or repeating one', () => {
    const days = [] as string[]
    for (let day = '2026-01-01'; day <= '2026-12-31'; day = addDays(day, 1)) days.push(day)
    expect(days).toHaveLength(365)
    expect(new Set(days).size).toBe(365)
    expect(days.at(-1)).toBe('2026-12-31')
  })
})

describe('the month grid', () => {
  it('starts on Monday, filling the first week with the month before', () => {
    // November 2026 starts on a Sunday.
    expect(gridOf(2026, 11)).toEqual([
      ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01*'],
      ['2026-11-02*', '2026-11-03*', '2026-11-04*', '2026-11-05*', '2026-11-06*', '2026-11-07*', '2026-11-08*'],
      ['2026-11-09*', '2026-11-10*', '2026-11-11*', '2026-11-12*', '2026-11-13*', '2026-11-14*', '2026-11-15*'],
      ['2026-11-16*', '2026-11-17*', '2026-11-18*', '2026-11-19*', '2026-11-20*', '2026-11-21*', '2026-11-22*'],
      ['2026-11-23*', '2026-11-24*', '2026-11-25*', '2026-11-26*', '2026-11-27*', '2026-11-28*', '2026-11-29*'],
      ['2026-11-30*', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'],
    ])
  })

  it('needs no day of the month before when the month starts on Monday', () => {
    // June 2026 starts on a Monday.
    const grid = gridOf(2026, 6)
    expect(grid[0][0]).toBe('2026-06-01*')
    expect(grid.at(-1)).toEqual(['2026-06-29*', '2026-06-30*', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'])
    expect(grid).toHaveLength(5)
  })

  it('starts mid-week', () => {
    // April 2026 starts on a Wednesday.
    expect(gridOf(2026, 4)[0]).toEqual(['2026-03-30', '2026-03-31', '2026-04-01*', '2026-04-02*', '2026-04-03*', '2026-04-04*', '2026-04-05*'])
  })

  it('holds February in leap and common years', () => {
    const leap = gridOf(2028, 2).flat().filter((day) => day.endsWith('*'))
    expect(leap).toHaveLength(29)
    expect(leap.at(-1)).toBe('2028-02-29*')
    const common = gridOf(2027, 2).flat().filter((day) => day.endsWith('*'))
    expect(common).toHaveLength(28)
    expect(common.at(-1)).toBe('2027-02-28*')
  })

  it('spans four, five or six weeks', () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(gridOf(2027, 2)).toHaveLength(4)
    expect(gridOf(2026, 4)).toHaveLength(5)
    expect(gridOf(2026, 11)).toHaveLength(6)
  })
})

describe('weeks', () => {
  it('start on the Monday of any date', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(mondayOf('2026-11-11')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09')
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
  })

  it('hold seven days from Monday, across a month and a year', () => {
    expect(weekDays('2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
    expect(weekDays('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  })
})

describe('moving between periods', () => {
  it('goes back and on by a month, across a year', () => {
    expect(previousPeriod(month(2026, 11))).toEqual(month(2026, 10))
    expect(nextPeriod(month(2026, 11))).toEqual(month(2026, 12))
    expect(nextPeriod(month(2026, 12))).toEqual(month(2027, 1))
    expect(previousPeriod(month(2027, 1))).toEqual(month(2026, 12))
  })

  it('goes back and on by a week, across a month and a year', () => {
    expect(previousPeriod(week('2026-11-09'))).toEqual(week('2026-11-02'))
    expect(nextPeriod(week('2026-11-30'))).toEqual(week('2026-12-07'))
    expect(nextPeriod(week('2026-12-28'))).toEqual(week('2027-01-04'))
    expect(previousPeriod(week('2027-01-04'))).toEqual(week('2026-12-28'))
  })

  it("comes back to today's month or week", () => {
    expect(todayPeriod('month', '2026-11-07')).toEqual(month(2026, 11))
    expect(todayPeriod('week', '2026-11-07')).toEqual(week('2026-11-02'))
    expect(todayPeriod('week', '2027-01-01')).toEqual(week('2026-12-28'))
  })
})

describe('addresses', () => {
  it('are the Calendar and its paths', () => {
    expect(calendarPath).toBe('/calendar')
    expect(isCalendarPath('/calendar')).toBe(true)
    expect(isCalendarPath('/calendar/month/2026-11')).toBe(true)
    expect(isCalendarPath('/calendar/milestones/abc')).toBe(true)
    expect(isCalendarPath('/calendars')).toBe(false)
    expect(isCalendarPath('/lab')).toBe(false)
  })

  it('write a month and a week', () => {
    expect(periodPath(month(2026, 11))).toBe('/calendar/month/2026-11')
    expect(periodPath(month(2027, 1))).toBe('/calendar/month/2027-01')
    expect(periodPath(week('2026-11-09'))).toBe('/calendar/week/2026-11-09')
  })

  it('read a month and a week back', () => {
    expect(periodFromPath('/calendar/month/2026-11')).toEqual(month(2026, 11))
    expect(periodFromPath('/calendar/month/0999-01')).toEqual(month(999, 1))
    expect(periodFromPath('/calendar/week/2026-11-09')).toEqual(week('2026-11-09'))
  })

  it("read a week's other days as its Monday", () => {
    expect(periodFromPath('/calendar/week/2026-11-12')).toEqual(week('2026-11-09'))
    expect(periodFromPath('/calendar/week/2027-01-03')).toEqual(week('2026-12-28'))
  })

  it('refuse anything else', () => {
    for (const path of [
      '/calendar',
      '/calendar/month',
      '/calendar/month/2026-13',
      '/calendar/month/2026-00',
      '/calendar/month/2026-1',
      '/calendar/month/2026-11-01',
      '/calendar/month/2026-11/',
      '/calendar/week/2026-02-30',
      '/calendar/week/2026-11',
      '/calendar/day/2026-11-09',
      '/lab/month/2026-11',
    ]) {
      expect(periodFromPath(path)).toBeNull()
    }
  })
})

describe('the span to fetch', () => {
  it("is a month's whole grid, the neighbouring days included", () => {
    expect(periodSpan(month(2026, 11))).toEqual({ from: '2026-10-26', to: '2026-12-06' })
    expect(periodSpan(month(2027, 2))).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it("is a week's seven days", () => {
    expect(periodSpan(week('2026-12-28'))).toEqual({ from: '2026-12-28', to: '2027-01-03' })
  })
})

/** A Milestone on 10 November, created `minute` minutes after 9:00. */
function milestone(title: string, minute: number, done = false): Milestone {
  const createdAt = `2026-11-01T09:${String(minute).padStart(2, '0')}:00.000Z`
  return { id: title, title, description: '', date: '2026-11-10', done, createdAt }
}

describe("a day's Milestones", () => {
  it('come pending first, then done, each by creation', () => {
    const day = [milestone('Done early', 1, true), milestone('Pending late', 9), milestone('Pending early', 2), milestone('Done late', 8, true)]

    expect(orderDay(day).map(({ title }) => title)).toEqual(['Pending early', 'Pending late', 'Done early', 'Done late'])
  })

  it('all fit in a cell up to three', () => {
    const day = [milestone('A', 1), milestone('B', 2), milestone('C', 3)]

    expect(cellMilestones(day)).toEqual({ shown: day, more: 0 })
    expect(cellMilestones([])).toEqual({ shown: [], more: 0 })
  })

  it('show the first three pending ones and how many more there are', () => {
    const day = [milestone('Done', 1, true), milestone('A', 2), milestone('B', 3), milestone('C', 4), milestone('D', 5)]

    const { shown, more } = cellMilestones(day)

    expect(shown.map(({ title }) => title)).toEqual(['A', 'B', 'C'])
    expect(more).toBe(2)
  })

  it('are pending when not done on a day before today', () => {
    expect(isPending(milestone('Yesterday', 1), '2026-11-11')).toBe(true)
    expect(isPending(milestone('Today', 1), '2026-11-10')).toBe(false)
    expect(isPending(milestone('Tomorrow', 1), '2026-11-09')).toBe(false)
    expect(isPending(milestone('Done', 1, true), '2026-11-11')).toBe(false)
  })
})
