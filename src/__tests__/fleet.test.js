import { describe, it, expect } from 'vitest'
import { fleetByCategory, unavailableReason, suggestVehiclesForRequest } from '../fleet.js'

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

describe('serving a request with actual vehicles', () => {
  const fleet = [
    { id: 'car1', plate: 'M1', category: 'light-road', seats: 4, status: 'free' },
    { id: 'van1', plate: 'M2', category: 'light-road', seats: 9, status: 'free' },
    { id: 'g1', plate: 'M3', category: 'light-offroad', seats: 4, status: 'free' },
    { id: 'duro1', plate: 'M4', category: 'medium', seats: 8, status: 'free' },
    { id: 'truck1', plate: 'M5', category: 'heavy', seats: 38, status: 'free' },
  ]
  const period = { startDate: '2026-09-10T08:00', endDate: '2026-09-10T17:00' }
  const serve = (lines, missions = []) =>
    suggestVehiclesForRequest(lines, { vehicles: fleet, missions, ...period })

  it('matches each requested type to a vehicle of the serving category', () => {
    const served = serve([{ type: 'class-g' }, { type: 'truck-personnel' }])
    expect(served.map(line => line.vehicleId)).toEqual(['g1', 'truck1'])
    expect(served.every(line => !line.unavailable)).toBe(true)
  })

  it('respects a capacity the type names, rather than the first light vehicle', () => {
    const [served] = serve([{ type: 'van-9' }])
    expect(served.vehicleId).toBe('van1')
  })

  it('never proposes the same vehicle twice in one request', () => {
    const served = serve([{ type: 'class-g' }, { type: 'class-g' }])
    expect(served[0].vehicleId).toBe('g1')
    expect(served[1]).toMatchObject({ vehicleId: '', unavailable: true })
  })

  it('leaves the slot empty when the fleet is busy over the period', () => {
    const missions = [{
      id: 'm1', title: 'T', startDate: '2026-09-10T07:00', endDate: '2026-09-10T18:00',
      vehicles: [{ id: 'r1', vehicleId: 'truck1' }], staffIds: [],
    }]
    expect(serve([{ type: 'truck-cargo' }], missions)[0])
      .toMatchObject({ vehicleId: '', unavailable: true })
  })

  it('does not guess for a type it knows nothing about', () => {
    const [served] = serve([{ type: 'other' }])
    expect(served.category).toBe('')
    // Anything free will do, since the request itself says nothing more.
    expect(served.vehicleId).toBe('car1')
  })

  it('carries the driver the requester asked for', () => {
    const served = serve([{ type: 'car', driverRequired: true }, { type: 'car' }])
    expect(served.map(line => line.driverRequired)).toEqual([true, false])
  })

  it('has nothing to propose for a request with no vehicle at all', () => {
    expect(serve([])).toEqual([])
    expect(suggestVehiclesForRequest(undefined, { vehicles: fleet, missions: [], ...period })).toEqual([])
  })
})
