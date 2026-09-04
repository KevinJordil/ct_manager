import { describe, it, expect } from 'vitest'
import { missionsOfPerson, roleInMission, pendingCount } from '../assignments.js'

const NOW = '2026-09-04T10:00'

const mission = (id, start, end, over = {}) => ({
  id, title: id, startDate: start, endDate: end, vehicles: [], staffIds: [], ...over,
})

const missions = [
  mission('running', '2026-09-04T08:00', '2026-09-04T17:00', {
    vehicles: [{ id: 'r1', vehicleId: 'v1', driverId: 'p1', withTrailer: true }],
  }),
  mission('soon', '2026-09-06T08:00', '2026-09-06T12:00', { staffIds: ['p1'] }),
  mission('later', '2026-09-20T08:00', '2026-09-20T12:00', {
    vehicles: [{ id: 'r2', vehicleId: 'v2', driverId: 'p1' }],
  }),
  mission('done', '2026-08-20T08:00', '2026-08-20T12:00', { staffIds: ['p1'] }),
  mission('older', '2026-08-01T08:00', '2026-08-01T12:00', {
    vehicles: [{ id: 'r3', vehicleId: 'v3', driverId: 'p1' }],
  }),
  mission('somebody-else', '2026-09-07T08:00', '2026-09-07T12:00', { staffIds: ['p2'] }),
]

describe('the part somebody plays', () => {
  it('names the vehicles they drive, trailer included', () => {
    expect(roleInMission(missions[0], 'p1')).toEqual({
      driving: [{ vehicleId: 'v1', withTrailer: true }],
      staff: false,
    })
  })

  it('sees crew as crew', () => {
    expect(roleInMission(missions[1], 'p1')).toEqual({ driving: [], staff: true })
  })

  it('reports both when somebody drives and is listed as crew', () => {
    const both = mission('both', '2026-09-04T08:00', '2026-09-04T17:00', {
      vehicles: [{ id: 'r1', vehicleId: 'v1', driverId: 'p1' }], staffIds: ['p1'],
    })
    expect(roleInMission(both, 'p1')).toMatchObject({ staff: true })
    expect(roleInMission(both, 'p1').driving).toHaveLength(1)
  })

  it('says nothing about somebody who is not on it', () => {
    expect(roleInMission(missions[0], 'p9')).toEqual({ driving: [], staff: false })
  })
})

describe('the missions of one person', () => {
  const groups = missionsOfPerson(missions, 'p1', NOW)

  it('keeps only the missions that person appears in', () => {
    const ids = [...groups.ongoing, ...groups.upcoming, ...groups.past].map(m => m.id)
    expect(ids).not.toContain('somebody-else')
    expect(ids).toHaveLength(5)
  })

  it('splits them by where they stand in time', () => {
    expect(groups.ongoing.map(m => m.id)).toEqual(['running'])
    expect(groups.upcoming.map(m => m.id)).toEqual(['soon', 'later'])
  })

  it('reads what is to come forwards and what is over backwards', () => {
    expect(groups.upcoming.map(m => m.id)).toEqual(['soon', 'later'])
    expect(groups.past.map(m => m.id)).toEqual(['done', 'older'])
  })

  it('carries the part played, so the list answers without opening anything', () => {
    expect(groups.ongoing[0].role.driving[0]).toEqual({ vehicleId: 'v1', withTrailer: true })
    expect(groups.upcoming[0].role.staff).toBe(true)
  })

  it('has nothing to say for an account tied to no record', () => {
    expect(missionsOfPerson(missions, '', NOW)).toEqual({ ongoing: [], upcoming: [], past: [] })
    expect(missionsOfPerson(missions, null, NOW)).toEqual({ ongoing: [], upcoming: [], past: [] })
  })

  it('counts what is running or still to come, not what is over', () => {
    expect(pendingCount(groups)).toBe(3)
  })
})
