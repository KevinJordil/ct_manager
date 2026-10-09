import { describe, it, expect } from 'vitest'
import { validateCollection, ENTITIES, unknownReference } from '../../validation.js'

const person = (over = {}) => ({
  id: 'p1', lastName: 'Müller', firstName: 'Andreas', licenses: ['930'],
  leaves: [], unavailable: false, ...over,
})
const vehicle = (over = {}) => ({
  id: 'v1', name: 'Duro', plate: 'M+123', category: 'medium', status: 'free', seats: 8, ...over,
})
const mission = (over = {}) => ({
  id: 'm1', title: 'Transport', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
  vehicles: [], staffIds: [], ...over,
})

describe('ENTITIES', () => {
  it('covers the four collections', () => {
    expect(ENTITIES).toEqual(['persons', 'vehicles', 'missions', 'trailers'])
  })
})

describe('validateCollection — accepted payloads', () => {
  it('accepts empty collections', () => {
    for (const entity of ENTITIES) expect(validateCollection(entity, [])).toBeNull()
  })

  it('accepts well-formed records', () => {
    expect(validateCollection('persons', [person()])).toBeNull()
    expect(validateCollection('vehicles', [vehicle()])).toBeNull()
    expect(validateCollection('missions', [mission()])).toBeNull()
  })

  it('tolerates missing optional fields', () => {
    expect(validateCollection('persons', [{ id: 'p1', lastName: 'X', firstName: 'Y' }])).toBeNull()
    expect(validateCollection('vehicles', [{ id: 'v1', name: 'X' }])).toBeNull()
    expect(validateCollection('missions', [{ id: 'm1', title: 'X' }])).toBeNull()
  })

  it('accepts a fully populated mission', () => {
    const m = mission({
      vehicles: [{ id: 'x', vehicleId: 'v1', driverId: 'p1', withTrailer: true }],
      staffIds: ['p2'],
    })
    expect(validateCollection('missions', [m])).toBeNull()
  })
})

describe('validateCollection — rejections', () => {
  it('rejects anything that is not an array', () => {
    expect(validateCollection('persons', { id: 'p1' })).toMatchObject({ code: 'notAnArray' })
    expect(validateCollection('persons', null)).toMatchObject({ code: 'notAnArray' })
    expect(validateCollection('persons', 'oops')).toMatchObject({ code: 'notAnArray' })
  })

  it('rejects an unknown collection', () => {
    expect(validateCollection('secrets', [])).toMatchObject({ code: 'unknownCollection' })
  })

  it('rejects items that are not objects', () => {
    expect(validateCollection('persons', [1, 2, 3])).toMatchObject({ code: 'notAnObject', params: { index: 0 } })
    expect(validateCollection('persons', [null])).toMatchObject({ code: 'notAnObject' })
  })

  it('requires an identifier', () => {
    expect(validateCollection('persons', [person({ id: undefined })])).toMatchObject({ code: 'missingId' })
    expect(validateCollection('persons', [person({ id: '' })])).toMatchObject({ code: 'missingId' })
  })

  it('rejects duplicate identifiers', () => {
    expect(validateCollection('persons', [person(), person()]))
      .toMatchObject({ code: 'duplicateId', params: { index: 1, id: 'p1' } })
  })

  it('rejects a text field of the wrong type', () => {
    expect(validateCollection('persons', [person({ lastName: 42 })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'lastName' } })
    expect(validateCollection('missions', [mission({ title: null })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'title' } })
  })

  it('rejects an unknown vehicle category or status', () => {
    expect(validateCollection('vehicles', [vehicle({ category: 'tank' })]))
      .toMatchObject({ code: 'unknownValue', params: { field: 'category' } })
    expect(validateCollection('vehicles', [vehicle({ status: 'on-mission' })]))
      .toMatchObject({ code: 'unknownValue', params: { field: 'status' } })
  })

  it('rejects an absurd seat count', () => {
    expect(validateCollection('vehicles', [vehicle({ seats: -1 })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'seats' } })
    expect(validateCollection('vehicles', [vehicle({ seats: 1.5 })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'seats' } })
  })

  it('rejects malformed dates', () => {
    expect(validateCollection('missions', [mission({ startDate: '02.09.2026' })]))
      .toMatchObject({ code: 'invalidDates' })
    expect(validateCollection('persons', [person({ leaves: [{ id: 'l1', startDate: 'yesterday', endDate: '2026-09-02' }] })]))
      .toMatchObject({ code: 'invalidNested', params: { list: 'leaves', position: 0, field: 'dates' } })
  })

  it('rejects malformed nested mission entries', () => {
    expect(validateCollection('missions', [mission({ vehicles: [{ id: 'x' }] })]))
      .toMatchObject({ code: 'invalidNested', params: { field: 'vehicleId' } })
    expect(validateCollection('missions', [mission({ staffIds: [{ id: 'p1' }] })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'staffIds' } })
  })

  it('rejects an oversized collection', () => {
    const tooMany = Array.from({ length: 5001 }, (_, i) => person({ id: `p${i}` }))
    expect(validateCollection('persons', tooMany)).toMatchObject({ code: 'tooManyItems' })
  })

  it('reports the index of the offending item', () => {
    const data = [person(), person({ id: 'p2' }), person({ id: 'p3', lastName: 42 })]
    expect(validateCollection('persons', data)).toMatchObject({ params: { index: 2 } })
  })
})

describe('vehicle keys', () => {
  const holder = (over = {}) => ({
    personId: 'p1', name: 'Sgt Favre', since: '2026-09-02T07:15', recordedBy: 'admin', ...over,
  })
  const entry = (over = {}) => ({
    id: 'e1', at: '2026-09-02T07:15', action: 'taken',
    personId: 'p1', name: 'Sgt Favre', from: '', recordedBy: 'admin', ...over,
  })

  it('accepts a key on the board and a key that is out', () => {
    expect(validateCollection('vehicles', [vehicle({ keyHolder: null, keyHistory: [] })])).toBeNull()
    expect(validateCollection('vehicles', [vehicle({
      keyHolder: holder(), keyHistory: [entry(), entry({ id: 'e2', action: 'returned' })],
    })])).toBeNull()
  })

  it('accepts a holder from outside the application, who has no id', () => {
    expect(validateCollection('vehicles', [vehicle({
      keyHolder: holder({ personId: null, name: 'Garage Dupont' }),
    })])).toBeNull()
  })

  it('rejects a holder without a name', () => {
    for (const name of ['', '   ', 42, undefined]) {
      expect(validateCollection('vehicles', [vehicle({ keyHolder: holder({ name }) })]))
        .toMatchObject({ code: 'invalidField', params: { field: 'keyHolder' } })
    }
  })

  it('rejects a holder that is not a record', () => {
    expect(validateCollection('vehicles', [vehicle({ keyHolder: 'Sgt Favre' })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'keyHolder' } })
    expect(validateCollection('vehicles', [vehicle({ keyHolder: ['Sgt Favre'] })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'keyHolder' } })
  })

  it('rejects a malformed date on the holder', () => {
    expect(validateCollection('vehicles', [vehicle({ keyHolder: holder({ since: '02.09.2026' }) })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'keyHolder' } })
  })

  it('rejects an unknown movement', () => {
    expect(validateCollection('vehicles', [vehicle({ keyHistory: [entry({ action: 'stolen' })] })]))
      .toMatchObject({ code: 'invalidNested', params: { list: 'keyHistory', position: 0, field: 'action' } })
  })

  it('rejects a history that is not an array', () => {
    expect(validateCollection('vehicles', [vehicle({ keyHistory: { e1: {} } })]))
      .toMatchObject({ code: 'invalidField', params: { field: 'keyHistory' } })
  })

  it('caps the history, since it grows on its own', () => {
    const long = Array.from({ length: 201 }, (_, i) => entry({ id: `e${i}` }))
    expect(validateCollection('vehicles', [vehicle({ keyHistory: long })]))
      .toMatchObject({ code: 'tooManyItems' })
  })
})

describe('error shape', () => {
  it('always carries a code and parameters, so the interface can translate it', () => {
    const error = validateCollection('persons', [person({ lastName: 42 })])
    expect(typeof error.code).toBe('string')
    expect(typeof error.params).toBe('object')
  })
})

describe('missions that cannot be', () => {
  const base = { id: 'm1', title: 'Transport', startDate: '2026-09-20T08:00', endDate: '2026-09-20T17:00' }

  it('refuses a date that is not on the calendar', () => {
    expect(validateCollection('missions', [{ ...base, startDate: '2026-13-45T99:99' }]))
      .toMatchObject({ code: 'invalidDates' })
    expect(validateCollection('missions', [{ ...base, startDate: '2026-02-30T08:00' }]))
      .toMatchObject({ code: 'invalidDates' })
  })

  it('refuses a mission that ends before it starts', () => {
    expect(validateCollection('missions', [{ ...base, endDate: '2026-09-20T07:00' }]))
      .toMatchObject({ code: 'endBeforeStart' })
  })

  it('refuses an empty title', () => {
    expect(validateCollection('missions', [{ ...base, title: '   ' }])).toMatchObject({ code: 'invalidField' })
  })

  it('refuses a leave that ends before it starts', () => {
    const person = { id: 'p1', lastName: 'A', firstName: 'B',
      leaves: [{ id: 'l', startDate: '2026-09-20T08:00', endDate: '2026-09-19T08:00' }] }
    expect(validateCollection('persons', [person])).toMatchObject({ code: 'endBeforeStart' })
  })
})

describe('references named by a mission', () => {
  const persons = [{ id: 'p1' }]
  const vehicles = [{ id: 'v1' }]
  const mission = over => ({ id: 'm', title: 'T', vehicles: [{ vehicleId: 'v1', driverId: 'p1' }], staffIds: [], ...over })

  it('accepts what exists', () => {
    expect(unknownReference([mission()], persons, vehicles)).toBeNull()
  })

  it('refuses a vehicle or a person that never existed', () => {
    expect(unknownReference([mission({ vehicles: [{ vehicleId: 'ghost' }] })], persons, vehicles))
      .toMatchObject({ code: 'unknownReference', params: { field: 'vehicleId' } })
    expect(unknownReference([mission({ staffIds: ['nobody'] })], persons, vehicles))
      .toMatchObject({ params: { field: 'staffIds' } })
  })

  it('accepts a deleted one that the mission still remembers', () => {
    const past = mission({ vehicles: [{ vehicleId: 'old', driverId: 'left' }],
      retiredVehicles: { old: { plate: 'M1' } }, retiredPersons: { left: { lastName: 'X' } } })
    expect(unknownReference([past], persons, vehicles)).toBeNull()
  })
})

describe('vehicle statuses', () => {
  it('accepts a vehicle in maintenance or broken down', () => {
    expect(validateCollection('vehicles', [vehicle({ status: 'maintenance' }), vehicle({ id: 'v2', status: 'broken' })])).toBeNull()
  })
})

describe('trailers', () => {
  const trailer = (over = {}) => ({ id: 't1', plate: 'M 1234', name: 'Remorque 1 t', compatibleTypes: ['class-g', 'duro'], status: 'free', ...over })

  it('accepts a trailer fitting several vehicle models', () => {
    expect(validateCollection('trailers', [trailer()])).toBeNull()
  })

  it('needs a plate', () => {
    expect(validateCollection('trailers', [trailer({ plate: ' ' })])).toMatchObject({ code: 'invalidField', params: { field: 'plate' } })
  })

  it('refuses a mission hitching a trailer that does not exist', () => {
    const mission = { id: 'm', title: 'T', vehicles: [{ vehicleId: 'v1', trailerId: 'ghost' }], staffIds: [] }
    expect(unknownReference([mission], [], [{ id: 'v1' }], [trailer()])).toMatchObject({ params: { field: 'trailerId' } })
    expect(unknownReference([{ ...mission, vehicles: [{ vehicleId: 'v1', trailerId: 't1' }] }], [], [{ id: 'v1' }], [trailer()])).toBeNull()
  })
})
