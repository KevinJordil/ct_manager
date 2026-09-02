import { describe, it, expect } from 'vitest'
import {
  lastCheck, checkHistory, daysSinceLastCheck, checkStatus, needsCheck,
  byCheckUrgency, CHECK_INTERVAL_DAYS, CHECK_STATUS,
} from '../checks.js'

const TODAY = '2026-09-10'

const vehicle = (over = {}) => ({ id: 'v1', name: 'Duro', plate: 'M1', checks: [], ...over })
const check = (date, over = {}) => ({ id: `c-${date}`, date, personId: 'p1', note: '', ...over })

describe('lastCheck / checkHistory', () => {
  it('returns null when nothing was ever recorded', () => {
    expect(lastCheck(vehicle())).toBeNull()
    expect(lastCheck(vehicle({ checks: undefined }))).toBeNull()
  })

  it('picks the most recent record, whatever the stored order', () => {
    const v = vehicle({ checks: [check('2026-09-01'), check('2026-09-08'), check('2026-08-20')] })
    expect(lastCheck(v).date).toBe('2026-09-08')
  })

  it('orders the history from newest to oldest', () => {
    const v = vehicle({ checks: [check('2026-09-01'), check('2026-09-08'), check('2026-08-20')] })
    expect(checkHistory(v).map(c => c.date)).toEqual(['2026-09-08', '2026-09-01', '2026-08-20'])
  })

  it('does not mutate the stored array', () => {
    const v = vehicle({ checks: [check('2026-09-01'), check('2026-09-08')] })
    checkHistory(v)
    expect(v.checks.map(c => c.date)).toEqual(['2026-09-01', '2026-09-08'])
  })
})

describe('daysSinceLastCheck', () => {
  it('counts whole days', () => {
    expect(daysSinceLastCheck(vehicle({ checks: [check('2026-09-08')] }), TODAY)).toBe(2)
    expect(daysSinceLastCheck(vehicle({ checks: [check(TODAY)] }), TODAY)).toBe(0)
  })

  it('returns null when there has never been a check', () => {
    expect(daysSinceLastCheck(vehicle(), TODAY)).toBeNull()
  })

  it('stays correct across a daylight saving change', () => {
    // Europe/Zurich: clocks change overnight on 25 October 2026.
    expect(daysSinceLastCheck(vehicle({ checks: [check('2026-10-24')] }), '2026-10-26')).toBe(2)
  })
})

describe('checkStatus', () => {
  it('is never without a record', () => {
    expect(checkStatus(vehicle(), TODAY)).toBe(CHECK_STATUS.NEVER)
  })

  it('is ok below the interval', () => {
    expect(checkStatus(vehicle({ checks: [check('2026-09-04')] }), TODAY)).toBe(CHECK_STATUS.OK)
    expect(checkStatus(vehicle({ checks: [check(TODAY)] }), TODAY)).toBe(CHECK_STATUS.OK)
  })

  it('is due exactly on the interval', () => {
    expect(checkStatus(vehicle({ checks: [check('2026-09-03')] }), TODAY)).toBe(CHECK_STATUS.DUE)
  })

  it('is overdue past the interval', () => {
    expect(checkStatus(vehicle({ checks: [check('2026-09-02')] }), TODAY)).toBe(CHECK_STATUS.OVERDUE)
  })

  it('switches on the documented interval', () => {
    expect(CHECK_INTERVAL_DAYS).toBe(7)
  })
})

describe('needsCheck', () => {
  it('is true for everything but an up-to-date vehicle', () => {
    expect(needsCheck(vehicle(), TODAY)).toBe(true)
    expect(needsCheck(vehicle({ checks: [check('2026-09-02')] }), TODAY)).toBe(true)
    expect(needsCheck(vehicle({ checks: [check('2026-09-09')] }), TODAY)).toBe(false)
  })
})

describe('byCheckUrgency', () => {
  it('puts never-checked vehicles first, then the most overdue', () => {
    const vehicles = [
      vehicle({ id: 'recent', checks: [check('2026-09-09')] }),
      vehicle({ id: 'old', checks: [check('2026-08-01')] }),
      vehicle({ id: 'never' }),
      vehicle({ id: 'middle', checks: [check('2026-09-01')] }),
    ]
    expect(byCheckUrgency(vehicles, TODAY).map(row => row.vehicle.id))
      .toEqual(['never', 'old', 'middle', 'recent'])
  })

  it('carries the day count alongside each vehicle', () => {
    const rows = byCheckUrgency([vehicle({ checks: [check('2026-09-08')] })], TODAY)
    expect(rows[0].days).toBe(2)
  })

  it('does not mutate the input', () => {
    const vehicles = [vehicle({ id: 'a' }), vehicle({ id: 'b', checks: [check('2026-09-09')] })]
    byCheckUrgency(vehicles, TODAY)
    expect(vehicles.map(v => v.id)).toEqual(['a', 'b'])
  })

  it('handles an empty fleet', () => {
    expect(byCheckUrgency([], TODAY)).toEqual([])
  })
})
