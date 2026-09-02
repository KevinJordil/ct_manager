import { describe, it, expect } from 'vitest'
import {
  getMissionStatus, ongoingMissions, missionInvolvesPerson, missionInvolvesVehicle,
  isOnLeaveAt, isOnLeaveDuring, getPersonStatus, getDisplayedPersonStatus,
  getVehicleStatus, missionsOverlapping, isPersonCommitted, isVehicleCommitted,
  isPersonAvailable, isVehicleAvailable,
} from '../availability.js'

const NOW = '2026-09-02T10:00'

const mission = (over = {}) => ({
  id: 'm1', title: 'Transport', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
  vehicles: [], staffIds: [], ...over,
})
const person = (over = {}) => ({
  id: 'p1', lastName: 'Müller', firstName: 'Andreas', licenses: ['930'],
  leaves: [], unavailable: false, ...over,
})
const vehicle = (over = {}) => ({
  id: 'v1', name: 'Duro', category: 'medium', status: 'free', seats: 8, ...over,
})

describe('getMissionStatus', () => {
  it('is ongoing between start and end', () => {
    expect(getMissionStatus(mission(), NOW)).toBe('ongoing')
  })

  it('is planned before the start', () => {
    expect(getMissionStatus(mission({ startDate: '2026-09-03T08:00', endDate: '2026-09-03T17:00' }), NOW)).toBe('planned')
  })

  it('is completed after the end', () => {
    expect(getMissionStatus(mission({ startDate: '2026-09-01T08:00', endDate: '2026-09-01T17:00' }), NOW)).toBe('completed')
  })

  it('switches at the exact local start time', () => {
    const m = mission()
    expect(getMissionStatus(m, '2026-09-02T07:59')).toBe('planned')
    expect(getMissionStatus(m, '2026-09-02T08:00')).toBe('ongoing')
    expect(getMissionStatus(m, '2026-09-02T17:00')).toBe('ongoing')
    expect(getMissionStatus(m, '2026-09-02T17:01')).toBe('completed')
  })

  it('falls back to planned without dates', () => {
    expect(getMissionStatus({ id: 'x' }, NOW)).toBe('planned')
    expect(getMissionStatus(null, NOW)).toBe('planned')
  })
})

describe('missionInvolvesPerson / missionInvolvesVehicle', () => {
  it('recognises a driver', () => {
    expect(missionInvolvesPerson(mission({ vehicles: [{ vehicleId: 'v1', driverId: 'p1' }] }), 'p1')).toBe(true)
  })

  it('recognises unmounted staff', () => {
    expect(missionInvolvesPerson(mission({ staffIds: ['p1'] }), 'p1')).toBe(true)
  })

  it('ignores an unassigned person', () => {
    expect(missionInvolvesPerson(mission(), 'p1')).toBe(false)
  })

  it('recognises an assigned vehicle', () => {
    expect(missionInvolvesVehicle(mission({ vehicles: [{ vehicleId: 'v1', driverId: null }] }), 'v1')).toBe(true)
    expect(missionInvolvesVehicle(mission(), 'v1')).toBe(false)
  })
})

describe('leave', () => {
  const onLeave = person({ leaves: [{ id: 'l1', startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }] })

  it('detects an ongoing leave', () => {
    expect(isOnLeaveAt(onLeave, NOW)).toBe(true)
    expect(isOnLeaveAt(onLeave, '2026-09-06T10:00')).toBe(false)
  })

  it('detects a leave overlapping a period', () => {
    expect(isOnLeaveDuring(onLeave, '2026-09-04T08:00', '2026-09-08T17:00')).toBe(true)
    expect(isOnLeaveDuring(onLeave, '2026-09-06T08:00', '2026-09-08T17:00')).toBe(false)
  })

  it('returns false without a period or without leave', () => {
    expect(isOnLeaveDuring(onLeave, null, '2026-09-08T17:00')).toBe(false)
    expect(isOnLeaveDuring(person(), '2026-09-04T08:00', '2026-09-08T17:00')).toBe(false)
  })
})

describe('getPersonStatus', () => {
  it('is available by default', () => {
    expect(getPersonStatus(person(), NOW)).toBe('available')
  })

  it('is on-leave during a leave', () => {
    expect(getPersonStatus(person({ leaves: [{ startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }] }), NOW))
      .toBe('on-leave')
  })

  it('gives unavailable precedence over leave', () => {
    const p = person({ unavailable: true, leaves: [{ startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }] })
    expect(getPersonStatus(p, NOW)).toBe('unavailable')
  })
})

describe('getDisplayedPersonStatus', () => {
  it('reports on-mission when an ongoing mission involves the person', () => {
    expect(getDisplayedPersonStatus(person(), [mission({ staffIds: ['p1'] })], NOW)).toBe('on-mission')
  })

  it('does not hide a leave behind a mission', () => {
    const p = person({ leaves: [{ startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }] })
    expect(getDisplayedPersonStatus(p, [mission({ staffIds: ['p1'] })], NOW)).toBe('on-leave')
  })

  it('stays available when the mission is not ongoing', () => {
    const missions = [mission({ startDate: '2026-09-10T08:00', endDate: '2026-09-10T17:00', staffIds: ['p1'] })]
    expect(getDisplayedPersonStatus(person(), missions, NOW)).toBe('available')
  })
})

describe('getVehicleStatus', () => {
  it('is free without a mission', () => {
    expect(getVehicleStatus(vehicle(), [], NOW)).toBe('free')
  })

  it('is on-mission during an ongoing mission', () => {
    const missions = [mission({ vehicles: [{ vehicleId: 'v1', driverId: 'p1' }] })]
    expect(getVehicleStatus(vehicle(), missions, NOW)).toBe('on-mission')
  })

  it('gives on-loan precedence', () => {
    const missions = [mission({ vehicles: [{ vehicleId: 'v1', driverId: 'p1' }] })]
    expect(getVehicleStatus(vehicle({ status: 'on-loan' }), missions, NOW)).toBe('on-loan')
  })
})

describe('missionsOverlapping', () => {
  const missions = [
    mission({ id: 'a', startDate: '2026-09-02T08:00', endDate: '2026-09-02T12:00' }),
    mission({ id: 'b', startDate: '2026-09-03T08:00', endDate: '2026-09-03T12:00' }),
  ]

  it('keeps only the overlapping ones', () => {
    expect(missionsOverlapping(missions, '2026-09-02T10:00', '2026-09-02T18:00').map(m => m.id)).toEqual(['a'])
  })

  it('excludes the mission being edited', () => {
    expect(missionsOverlapping(missions, '2026-09-02T10:00', '2026-09-02T18:00', { excludeMissionId: 'a' })).toEqual([])
  })
})

describe('isPersonCommitted / isVehicleCommitted', () => {
  const missions = [mission({ id: 'a', vehicles: [{ vehicleId: 'v1', driverId: 'p1' }] })]

  it('detects a conflict over an overlapping period', () => {
    expect(isPersonCommitted('p1', missions, '2026-09-02T10:00', '2026-09-02T18:00')).toBe(true)
    expect(isVehicleCommitted('v1', missions, '2026-09-02T10:00', '2026-09-02T18:00')).toBe(true)
  })

  it('sees no conflict outside the period', () => {
    expect(isPersonCommitted('p1', missions, '2026-09-05T08:00', '2026-09-05T18:00')).toBe(false)
  })
})

describe('isPersonAvailable', () => {
  const missions = [mission({ id: 'a', staffIds: ['p1'] })]

  it('refuses a person flagged unavailable', () => {
    expect(isPersonAvailable(person({ unavailable: true }), [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuses a person on leave during the period', () => {
    const p = person({ leaves: [{ startDate: '2026-09-09T00:00', endDate: '2026-09-11T23:59' }] })
    expect(isPersonAvailable(p, [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuses a person already committed over the period', () => {
    expect(isPersonAvailable(person(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { now: NOW })).toBe(false)
  })

  it('accepts the person while editing the mission that commits them', () => {
    expect(isPersonAvailable(person(), missions, '2026-09-02T10:00', '2026-09-02T18:00',
      { excludeMissionId: 'a', now: NOW })).toBe(true)
  })

  it('ignores missions that are already completed', () => {
    const past = [mission({ id: 'z', startDate: '2026-08-01T08:00', endDate: '2026-08-01T17:00', staffIds: ['p1'] })]
    expect(isPersonAvailable(person(), past, '2026-08-01T09:00', '2026-08-01T12:00', { now: NOW })).toBe(true)
  })

  it('only looks at the current leave when no period is given', () => {
    const p = person({ leaves: [{ startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }] })
    expect(isPersonAvailable(p, missions, '', '', { now: NOW })).toBe(false)
    expect(isPersonAvailable(person(), missions, '', '', { now: NOW })).toBe(true)
  })
})

describe('isVehicleAvailable', () => {
  const missions = [mission({ id: 'a', vehicles: [{ vehicleId: 'v1', driverId: null }] })]

  it('refuses a vehicle on loan', () => {
    expect(isVehicleAvailable(vehicle({ status: 'on-loan' }), [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuses a vehicle already committed over the period', () => {
    expect(isVehicleAvailable(vehicle(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { now: NOW })).toBe(false)
  })

  it('accepts the vehicle while editing the mission that commits it', () => {
    expect(isVehicleAvailable(vehicle(), missions, '2026-09-02T10:00', '2026-09-02T18:00',
      { excludeMissionId: 'a', now: NOW })).toBe(true)
  })

  it('accepts a free vehicle when no period is given', () => {
    expect(isVehicleAvailable(vehicle(), missions, '', '')).toBe(true)
  })
})

describe('ongoingMissions', () => {
  it('filters on the computed status', () => {
    const missions = [
      mission({ id: 'a' }),
      mission({ id: 'b', startDate: '2026-09-10T08:00', endDate: '2026-09-10T17:00' }),
    ]
    expect(ongoingMissions(missions, NOW).map(m => m.id)).toEqual(['a'])
  })
})
