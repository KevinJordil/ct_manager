import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  toDateString, toDateTimeString, parseLocal, todayString, nowString,
  addDays, addMonths, mondayOf, overlaps, formatDateTime, withDefaultTime,
  elapsedSince,
} from '../datetime.js'

afterEach(() => vi.useRealTimers())

describe('toDateString / toDateTimeString', () => {
  it('formats in local time, not UTC', () => {
    // Local midnight: toISOString() would return the previous day in Europe/Zurich.
    expect(toDateString(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
    expect(toDateTimeString(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05T00:00')
  })

  it('pads numbers to two digits', () => {
    expect(toDateTimeString(new Date(2026, 8, 2, 9, 5))).toBe('2026-09-02T09:05')
  })
})

describe('parseLocal', () => {
  it('reads strings as local time', () => {
    const d = parseLocal('2026-09-02T08:30')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()])
      .toEqual([2026, 8, 2, 8, 30])
  })

  it('accepts a date with no time part', () => {
    expect(toDateTimeString(parseLocal('2026-09-02'))).toBe('2026-09-02T00:00')
  })

  it('round-trips with toDateTimeString', () => {
    const s = '2026-12-31T23:59'
    expect(toDateTimeString(parseLocal(s))).toBe(s)
  })
})

describe('addDays', () => {
  it('moves one day forward', () => {
    expect(addDays('2026-09-02', 1)).toBe('2026-09-03')
  })

  it('moves one day back', () => {
    expect(addDays('2026-09-02', -1)).toBe('2026-09-01')
  })

  it('moves one week forward', () => {
    expect(addDays('2026-09-02', 7)).toBe('2026-09-09')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // leap year
  })

  it('stays correct across daylight saving changes', () => {
    // Europe/Zurich: clocks change overnight on 28-29 March 2026.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    // ... and back on 25 October 2026.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('addMonths', () => {
  it('moves one month forward and back', () => {
    expect(addMonths('2026-09-02', 1)).toBe('2026-10-02')
    expect(addMonths('2026-09-02', -1)).toBe('2026-08-02')
  })

  it('clamps to the last day of the target month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('crosses the year boundary', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('mondayOf', () => {
  it('returns the Monday of the week', () => {
    // 2026-09-02 est un mercredi.
    expect(mondayOf('2026-09-02')).toBe('2026-08-31')
  })

  it('is stable on a Monday', () => {
    expect(mondayOf('2026-08-31')).toBe('2026-08-31')
  })

  it('attaches Sunday to the week that is ending', () => {
    // 2026-09-06 is a Sunday: its Monday is 31 August, not 7 September.
    expect(mondayOf('2026-09-06')).toBe('2026-08-31')
  })

  it('maps all seven days of one week to the same Monday', () => {
    const semaine = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
                     '2026-09-04', '2026-09-05', '2026-09-06']
    for (const jour of semaine) expect(mondayOf(jour)).toBe('2026-08-31')
  })
})

describe('overlaps', () => {
  it('detects a partial overlap', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-03T17:00',
                    '2026-09-02T08:00', '2026-09-04T17:00')).toBe(true)
  })

  it('detects containment', () => {
    expect(overlaps('2026-09-01T00:00', '2026-09-30T23:59',
                    '2026-09-10T08:00', '2026-09-11T17:00')).toBe(true)
  })

  it('rejects disjoint ranges', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00',
                    '2026-09-03T08:00', '2026-09-04T17:00')).toBe(false)
  })

  it('treats bounds as inclusive', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00',
                    '2026-09-02T17:00', '2026-09-03T08:00')).toBe(true)
  })

  it('returns false when a bound is missing', () => {
    expect(overlaps(null, '2026-09-02T17:00', '2026-09-01T08:00', '2026-09-03T08:00')).toBe(false)
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00', '', null)).toBe(false)
  })
})

describe('nowString / todayString', () => {
  it('return local time, not UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 9, 26)) // 09:26 local time
    expect(nowString()).toBe('2026-09-02T09:26')
    expect(todayString()).toBe('2026-09-02')
  })

  it('does not roll over the day just after midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 0, 30)) // 00:30 local time
    expect(todayString()).toBe('2026-09-02')
  })
})

describe('formatDateTime', () => {
  it('formats a date and time', () => {
    expect(formatDateTime('2026-04-28T09:00')).toBe('28.04.2026 09:00')
  })

  it('formats a bare date', () => {
    expect(formatDateTime('2026-04-28')).toBe('28.04.2026')
  })

  it('renders a dash for an empty value', () => {
    expect(formatDateTime('')).toBe('—')
    expect(formatDateTime(null)).toBe('—')
  })
})

describe('withDefaultTime', () => {
  it('appends the default time', () => {
    expect(withDefaultTime('2026-04-28', '08:00')).toBe('2026-04-28T08:00')
  })

  it('leaves an already timed date alone', () => {
    expect(withDefaultTime('2026-04-28T14:30', '08:00')).toBe('2026-04-28T14:30')
  })

  it('passes empty values through', () => {
    expect(withDefaultTime('')).toBe('')
    expect(withDefaultTime(null)).toBe(null)
  })
})

describe('elapsedSince', () => {
  it('counts in minutes below the hour', () => {
    expect(elapsedSince('2026-09-04T08:00', '2026-09-04T08:45')).toEqual({ unit: 'minutes', value: 45 })
    expect(elapsedSince('2026-09-04T08:00', '2026-09-04T08:00')).toEqual({ unit: 'minutes', value: 0 })
  })

  it('counts in whole hours, dropping the minutes on top', () => {
    expect(elapsedSince('2026-09-04T08:00', '2026-09-04T11:59')).toEqual({ unit: 'hours', value: 3 })
  })

  it('counts in whole days past twenty-four hours', () => {
    expect(elapsedSince('2026-09-01T08:00', '2026-09-04T09:00')).toEqual({ unit: 'days', value: 3 })
  })

  it('reads a bare date as the start of that day', () => {
    expect(elapsedSince('2026-09-04', '2026-09-04T02:00')).toEqual({ unit: 'hours', value: 2 })
  })

  it('never reports a negative age for a date in the future', () => {
    expect(elapsedSince('2026-09-05T08:00', '2026-09-04T08:00')).toEqual({ unit: 'minutes', value: 0 })
  })
})
