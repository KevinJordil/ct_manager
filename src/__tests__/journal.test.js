import { describe, it, expect } from 'vitest'
import { mergeJournal, deletionBlocker, rememberResources } from '../../journal.js'
import { journalCsv } from '../journal-export.js'
import { getMissionStatus, isPersonCommitted, isVehicleCommitted } from '../availability.js'

const at = '2099-10-09T08:00'
const vehicle = { id: 'v1', name: 'Duro', plate: 'M1', keyHistory: [{ id: 'take', at, action: 'taken', name: 'Favre' }] }
const mission = { id: 'm1', title: 'Transport', startDate: at, endDate: '2099-10-09T18:00', vehicles: [{ vehicleId: 'v1', driverId: 'p1' }], staffIds: [] }

describe('durable journal', () => {
  it('retains identities and entries after renaming, trimming and deleting a vehicle', () => {
    const initial = mergeJournal({ entries: [], archives: [] }, [vehicle])
    const returned = mergeJournal(initial, [{ ...vehicle, plate: 'M2', keyHistory: [
      { ...vehicle.keyHistory[0], closedBy: 'return' },
      { id: 'return', at, action: 'returned', name: 'Favre', closes: 'take' },
    ] }])
    expect(returned.entries.find(e => e.id === 'take')).toMatchObject({ vehiclePlate: 'M1', closedBy: 'return' })
    expect(returned.entries.find(e => e.id === 'return').sequence).toBeGreaterThan(returned.entries[0].sequence)
    expect(mergeJournal(returned, []).entries).toEqual(returned.entries)
  })
  it('never reintroduces archived events when old vehicle histories are saved', () => {
    const initial = mergeJournal({ entries: [], archives: [] }, [vehicle])
    const archived = { ...initial, entries: [], archives: [{ id: 'a1', entries: initial.entries }] }
    expect(mergeJournal(archived, [vehicle]).entries).toEqual([])
  })
  it('exports transfers and safely quotes spreadsheet formulas', () => {
    const csv = journalCsv([{ ...vehicle.keyHistory[0], vehiclePlate: '=1+1', vehicleName: 'Duro; "A"', action: 'transferred', from: 'Favre', name: 'Müller' }], (key, params) => params ? `${params.from} → ${params.to}` : key)
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"Duro; ""A"""')
    expect(csv).toContain('Favre → Müller')
  })
})

describe('deletion and cancellation', () => {
  it('blocks a holder or a vehicle with an outstanding key', () => {
    const vehicles = [{ ...vehicle, keyHolder: { personId: 'p1' } }]
    for (const [entity, id] of [['persons', 'p1'], ['vehicles', 'v1']]) {
      expect(deletionBlocker(entity, [{ id }], vehicles, [], at)?.code).toBe('deletion.keys')
    }
  })
  it('blocks current and future assignments and names the missions', () => {
    expect(deletionBlocker('persons', [{ id: 'p1' }], [], [mission], at)?.params.missions).toBe('Transport')
    expect(deletionBlocker('vehicles', [{ id: 'v1' }], [], [mission], at)?.code).toBe('deletion.missions')
    expect(deletionBlocker('persons', [{ id: 'crew' }], [], [{ ...mission, staffIds: ['crew'] }], at)?.code).toBe('deletion.missions')
  })
  it('keeps cancelled missions consultable and frees both resources', () => {
    const cancelled = { ...mission, cancelled: true }
    expect(getMissionStatus(cancelled, at)).toBe('cancelled')
    expect(isPersonCommitted('p1', [cancelled], at, mission.endDate)).toBe(false)
    expect(isVehicleCommitted('v1', [cancelled], at, mission.endDate)).toBe(false)
    expect(deletionBlocker('persons', [{ id: 'p1' }], [], [cancelled], at)).toBeNull()
    expect(deletionBlocker('vehicles', [{ id: 'v1' }], [], [mission], '2100-01-01T00:00')).toBeNull()
  })
})


describe('reference cleanup after an authorised deletion', () => {
  it('keeps a deleted resource in the past missions it took part in', () => {
    const past = { ...mission, staffIds: ['p1', 'p2'], cancelled: true }
    const unrelated = { ...mission, id: 'other', vehicles: [], staffIds: [] }
    const persons = rememberResources('persons',
      [{ id: 'p1', rank: 'Sgt', firstName: 'Caroline', lastName: 'Favre', phone: '079' }], [past, unrelated])
    expect(persons[0]).toMatchObject({
      id: 'm1', cancelled: true, staffIds: ['p1', 'p2'], vehicles: [{ vehicleId: 'v1', driverId: 'p1' }],
      retiredPersons: { p1: { rank: 'Sgt', firstName: 'Caroline', lastName: 'Favre' } },
    })
    // Only what identifies the person on paper is frozen, not their phone.
    expect(persons[0].retiredPersons.p1).not.toHaveProperty('phone')
    expect(persons[1]).toBe(unrelated)
    expect(rememberResources('vehicles', [vehicle], persons)[0]).toMatchObject({
      vehicles: [{ vehicleId: 'v1' }], retiredVehicles: { v1: { plate: 'M1', name: 'Duro' } },
    })
  })
})
