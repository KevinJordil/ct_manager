import { describe, it, expect } from 'vitest'
import { fleetByCategory, unavailableReason } from '../fleet.js'

const NOW = '2026-09-04T09:00'

const vehicle = (over = {}) => ({
  id: 'v1', name: 'Duro', plate: 'M1', category: 'medium',
  status: 'free', keyHolder: null, keyHistory: [], ...over,
})

const holder = { personId: 'p1', name: 'Sgt Favre', since: '2026-09-04T07:00' }

const missionOn = (vehicleId, over = {}) => ({
  id: 'm1', title: 'T',
  startDate: '2026-09-04T08:00', endDate: '2026-09-04T17:00',
  vehicles: [{ id: 'r1', vehicleId }], staffIds: [], ...over,
})

describe('why a vehicle cannot be taken', () => {
  it('says nothing about one that is free with its key on the board', () => {
    expect(unavailableReason(vehicle(), [], NOW)).toBe(null)
  })

  it('names the mission before anything else', () => {
    expect(unavailableReason(vehicle({ keyHolder: holder }), [missionOn('v1')], NOW))
      .toBe('on-mission')
  })

  it('names the loan', () => {
    expect(unavailableReason(vehicle({ status: 'on-loan' }), [], NOW)).toBe('on-loan')
  })

  it('counts a key in somebody\'s pocket, with nothing planned', () => {
    expect(unavailableReason(vehicle({ keyHolder: holder }), [], NOW)).toBe('key-out')
  })

  it('ignores a mission that is over', () => {
    const past = missionOn('v1', { startDate: '2026-09-01T08:00', endDate: '2026-09-01T17:00' })
    expect(unavailableReason(vehicle(), [past], NOW)).toBe(null)
  })
})

describe('the fleet read by type', () => {
  const fleet = [
    vehicle({ id: 'h1', category: 'heavy', plate: 'M1' }),
    vehicle({ id: 'h2', category: 'heavy', plate: 'M2', keyHolder: holder }),
    vehicle({ id: 'h3', category: 'heavy', plate: 'M3', status: 'on-loan' }),
    vehicle({ id: 'm1v', category: 'medium', plate: 'M4' }),
    vehicle({ id: 'l1', category: 'light-road', plate: 'M5' }),
  ]

  it('counts what can be taken, and what stands in the way', () => {
    const [light, medium, heavy] = fleetByCategory(fleet, [missionOn('h1')], NOW)
    expect(light).toMatchObject({ category: 'light-road', total: 1, available: 1 })
    expect(medium).toMatchObject({ category: 'medium', total: 1, available: 1 })
    expect(heavy).toMatchObject({
      category: 'heavy', total: 3, available: 0, onMission: 1, onLoan: 1, keyOut: 1,
    })
  })

  it('follows the order categories are declared in, not the data', () => {
    expect(fleetByCategory(fleet, [], NOW).map(group => group.category))
      .toEqual(['light-road', 'medium', 'heavy'])
  })

  it('leaves out a type nobody owns', () => {
    expect(fleetByCategory([vehicle({ category: 'heavy' })], [], NOW).map(g => g.category))
      .toEqual(['heavy'])
  })

  it('keeps a vehicle whose category is unknown rather than dropping it', () => {
    const groups = fleetByCategory([vehicle({ category: undefined })], [], NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ category: 'other', total: 1, available: 1 })
  })

  it('counts each vehicle once, whatever holds it back', () => {
    const [group] = fleetByCategory(fleet.filter(v => v.category === 'heavy'), [missionOn('h1')], NOW)
    expect(group.available + group.onMission + group.onLoan + group.keyOut).toBe(group.total)
  })

  it('has nothing to say about an empty fleet', () => {
    expect(fleetByCategory([], [], NOW)).toEqual([])
  })
})
