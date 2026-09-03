import { describe, it, expect } from 'vitest'
import { computeShift, reanchor } from '../../seed.js'
import { getMissionStatus } from '../availability.js'
import { toDateTimeString } from '../datetime.js'

const REFERENCE = new Date(2026, 8, 2, 10, 0) // 2 September 2026

const missions = [
  { id: 'm1', title: 'A', startDate: '2026-04-10T08:00', endDate: '2026-04-10T17:00', vehicles: [], staffIds: [] },
  { id: 'm2', title: 'B', startDate: '2026-06-05T08:00', endDate: '2026-06-05T17:00', vehicles: [], staffIds: [] },
]

describe('computeShift', () => {
  it('moves the midpoint of the period onto the reference date', () => {
    // Midpoint of 10 April – 5 June is 8 May; 8 May to 2 September is 117 days.
    expect(computeShift({ missions }, REFERENCE)).toBe(117)
  })

  it('shifts nothing when the set is already centred', () => {
    const centred = [
      { id: 'm1', startDate: '2026-09-01T08:00', endDate: '2026-09-01T17:00' },
      { id: 'm2', startDate: '2026-09-03T08:00', endDate: '2026-09-03T17:00' },
    ]
    expect(computeShift({ missions: centred }, REFERENCE)).toBe(0)
  })

  it('returns 0 when there is no date at all', () => {
    expect(computeShift({ vehicles: [{ id: 'v1', name: 'Duro' }] }, REFERENCE)).toBe(0)
  })
})

describe('reanchor', () => {
  it('shifts the dates while preserving times of day', () => {
    const { missions: shifted } = reanchor({ missions }, REFERENCE)
    expect(shifted[0].startDate).toBe('2026-08-05T08:00')
    expect(shifted[0].endDate).toBe('2026-08-05T17:00')
    expect(shifted[1].startDate).toBe('2026-09-30T08:00')
  })

  it('preserves the gap between dates', () => {
    const { missions: shifted } = reanchor({ missions }, REFERENCE)
    const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
    expect(days(shifted[0].startDate, shifted[1].startDate))
      .toBe(days(missions[0].startDate, missions[1].startDate))
  })

  it('shifts nested dates such as leaves', () => {
    const persons = [{ id: 'p1', lastName: 'X', leaves: [{ id: 'l1', startDate: '2026-05-06T00:00', endDate: '2026-05-12T23:59' }] }]
    const { persons: shifted } = reanchor({ missions, persons }, REFERENCE)
    expect(shifted[0].leaves[0].startDate).toBe('2026-08-31T00:00')
    expect(shifted[0].leaves[0].endDate).toBe('2026-09-06T23:59')
  })

  it('re-anchors bare dates too, such as weekly checks and loan deadlines', () => {
    const vehicles = [{
      id: 'v1', name: 'Duro',
      checks: [{ id: 'c1', date: '2026-05-07' }],
      loanUntil: '2026-05-20',
    }]
    const { vehicles: shifted } = reanchor({ missions, vehicles }, REFERENCE)
    // 117 days, the same shift as the missions.
    expect(shifted[0].checks[0].date).toBe('2026-09-01')
    expect(shifted[0].loanUntil).toBe('2026-09-14')
  })

  it('keeps each date in the shape it came in', () => {
    const vehicles = [{ id: 'v1', checks: [{ id: 'c1', date: '2026-05-07' }] }]
    const shifted = reanchor({ missions, vehicles }, REFERENCE)
    expect(shifted.vehicles[0].checks[0].date).not.toContain('T')
    expect(shifted.missions[0].startDate).toContain('T')
  })

  it('leaves strings that are not dates alone', () => {
    const vehicles = [{ id: 'v1', name: 'Duro', plate: 'M12345', loanNote: '' }]
    const { vehicles: shifted } = reanchor({ missions, vehicles }, REFERENCE)
    expect(shifted[0]).toEqual(vehicles[0])
  })

  it('applies the same shift to every collection', () => {
    const persons = [{ id: 'p1', leaves: [{ id: 'l1', startDate: '2026-05-06T00:00', endDate: '2026-05-12T23:59' }] }]
    const shifted = reanchor({ missions, persons }, REFERENCE)
    const missionShift = new Date(shifted.missions[0].startDate) - new Date(missions[0].startDate)
    const leaveShift = new Date(shifted.persons[0].leaves[0].startDate) - new Date(persons[0].leaves[0].startDate)
    expect(missionShift).toBe(leaveShift)
  })
})

describe('shipped demonstration set', () => {
  const read = async name => {
    const { readFile } = await import('fs/promises')
    return JSON.parse(await readFile(new URL(`../../data.example/${name}.json`, import.meta.url), 'utf-8'))
  }

  it('shows an ongoing mission plus past and future ones', async () => {
    const collections = { missions: await read('missions'), persons: await read('persons') }
    const shifted = reanchor(collections, REFERENCE)
    const now = toDateTimeString(REFERENCE)

    const statuses = shifted.missions.map(m => getMissionStatus(m, now))
    expect(statuses).toContain('ongoing')
    expect(statuses).toContain('completed')
    expect(statuses).toContain('planned')
  })

  it('shows somebody on leave on installation day', async () => {
    const collections = { missions: await read('missions'), persons: await read('persons') }
    const shifted = reanchor(collections, REFERENCE)
    const now = toDateTimeString(REFERENCE)

    const onLeave = shifted.persons.filter(p =>
      p.leaves?.some(l => l.startDate <= now && now <= l.endDate))
    expect(onLeave.length).toBeGreaterThan(0)
  })

  it('includes a vehicle on loan, so every status is represented', async () => {
    const vehicles = await read('vehicles')
    expect(vehicles.some(v => v.status === 'on-loan')).toBe(true)
  })

  it('leaves some vehicles checked recently, so the SPH page is not all red', async () => {
    const { needsCheck } = await import('../checks.js')
    const { vehicles } = reanchor({ missions: await read('missions'), vehicles: await read('vehicles') }, REFERENCE)
    const today = '2026-09-02'
    expect(vehicles.some(vehicle => !needsCheck(vehicle, today))).toBe(true)
    expect(vehicles.some(vehicle => needsCheck(vehicle, today))).toBe(true)
  })
})
