import { describe, it, expect } from 'vitest'
import {
  PERMISSIONS, defaultPermissions, sanitisePermissions, can,
  INTERACTION_FIELDS, forbiddenChange,
} from '../../permissions.js'

const admin = { role: 'admin' }
const plain = { role: 'user', permissions: {} }
const keeper = { role: 'user', permissions: { 'vehicles.manage': true } }

describe('what an account holds', () => {
  it('grants nothing by default', () => {
    expect(defaultPermissions()).toEqual({})
    for (const permission of PERMISSIONS) expect(can(plain, permission)).toBe(false)
  })

  it('grants an administrator everything, including rights added later', () => {
    for (const permission of [...PERMISSIONS, 'something.invented']) {
      expect(can(admin, permission)).toBe(true)
    }
  })

  it('grants exactly what was written down', () => {
    expect(can(keeper, 'vehicles.manage')).toBe(true)
    expect(can(keeper, 'persons.manage')).toBe(false)
  })

  it('refuses everything to nobody at all', () => {
    expect(can(null, 'vehicles.manage')).toBe(false)
    expect(can(undefined, 'vehicles.manage')).toBe(false)
  })

  it('reads an account saved before rights existed as holding none', () => {
    expect(can({ role: 'user' }, 'vehicles.manage')).toBe(false)
  })
})

describe('accepting rights from a request', () => {
  it('keeps the known ones', () => {
    expect(sanitisePermissions({ 'vehicles.manage': true, 'persons.manage': true }))
      .toEqual({ 'vehicles.manage': true, 'persons.manage': true })
  })

  it('drops an invented right, so a typo cannot become a right', () => {
    expect(sanitisePermissions({ 'secrets.read': true, admin: true })).toEqual({})
  })

  it('takes only a literal true', () => {
    expect(sanitisePermissions({ 'vehicles.manage': 'yes' })).toEqual({})
    expect(sanitisePermissions({ 'vehicles.manage': 1 })).toEqual({})
    expect(sanitisePermissions({ 'vehicles.manage': false })).toEqual({})
  })

  it('copes with anything else at all', () => {
    for (const value of [null, undefined, 'admin', 42, ['vehicles.manage']]) {
      expect(sanitisePermissions(value)).toEqual({})
    }
  })
})

describe('what may be changed without the right to manage', () => {
  const vehicle = (over = {}) => ({
    id: 'v1', name: 'Duro', plate: 'M1', category: 'medium', seats: 8,
    status: 'free', keyHolder: null, keyHistory: [], checks: [], ...over,
  })

  it('lets a key be taken, passed on and hung up', () => {
    const holder = { personId: 'p1', name: 'Sgt Favre', since: '2026-09-04T07:00', recordedBy: 'favre' }
    const after = [vehicle({ keyHolder: holder, keyHistory: [{ id: 'e1', action: 'taken' }] })]
    expect(forbiddenChange('vehicles', [vehicle()], after)).toBeNull()
  })

  it('lets a check be recorded', () => {
    const after = [vehicle({ checks: [{ id: 'c1', date: '2026-09-04' }] })]
    expect(forbiddenChange('vehicles', [vehicle()], after)).toBeNull()
  })

  it('lets a vehicle be lent out and brought back', () => {
    const lent = [vehicle({ status: 'on-loan', loanNote: 'cp EM', loanUntil: '2026-09-10' })]
    expect(forbiddenChange('vehicles', [vehicle()], lent)).toBeNull()
    expect(forbiddenChange('vehicles', lent, [vehicle()])).toBeNull()
  })

  it('lets an absence be recorded on a person', () => {
    const person = (over = {}) => ({ id: 'p1', firstName: 'A', lastName: 'B', licenses: ['930'], ...over })
    const after = [person({ unavailable: true, unavailabilityNote: 'malade', leaves: [{ id: 'l1' }] })]
    expect(forbiddenChange('persons', [person()], after)).toBeNull()
  })

  it('refuses a new record', () => {
    expect(forbiddenChange('vehicles', [vehicle()], [vehicle(), vehicle({ id: 'v2' })]))
      .toMatchObject({ code: 'created', params: { entity: 'vehicles' } })
  })

  it('refuses a deletion', () => {
    expect(forbiddenChange('vehicles', [vehicle(), vehicle({ id: 'v2' })], [vehicle()]))
      .toMatchObject({ code: 'deleted', params: { entity: 'vehicles' } })
  })

  it('refuses a change of identity, naming the field', () => {
    expect(forbiddenChange('vehicles', [vehicle()], [vehicle({ plate: 'M2' })]))
      .toMatchObject({ code: 'edited', params: { entity: 'vehicles', field: 'plate' } })
    expect(forbiddenChange('vehicles', [vehicle()], [vehicle({ seats: 4 })]))
      .toMatchObject({ code: 'edited', params: { field: 'seats' } })
  })

  it('refuses a field slipped in that the stored record did not have', () => {
    expect(forbiddenChange('vehicles', [vehicle()], [{ ...vehicle(), role: 'admin' }]))
      .toMatchObject({ code: 'edited', params: { field: 'role' } })
  })

  it('refuses a field quietly dropped', () => {
    const { plate, ...withoutPlate } = vehicle()
    expect(forbiddenChange('vehicles', [vehicle()], [withoutPlate]))
      .toMatchObject({ code: 'edited', params: { field: 'plate' } })
  })

  it('holds a mission whole: planning is management through and through', () => {
    expect(INTERACTION_FIELDS.missions).toEqual([])
    const mission = (over = {}) => ({ id: 'm1', title: 'T', startDate: '2026-09-04T08:00', ...over })
    expect(forbiddenChange('missions', [mission()], [mission()])).toBeNull()
    expect(forbiddenChange('missions', [mission()], [mission({ title: 'U' })]))
      .toMatchObject({ code: 'edited', params: { field: 'title' } })
  })

  it('accepts an unchanged collection, whatever it holds', () => {
    const fleet = [vehicle(), vehicle({ id: 'v2', plate: 'M2' })]
    expect(forbiddenChange('vehicles', fleet, structuredClone(fleet))).toBeNull()
  })

  it('is not fooled by a reordering', () => {
    const fleet = [vehicle(), vehicle({ id: 'v2', plate: 'M2' })]
    expect(forbiddenChange('vehicles', fleet, [fleet[1], fleet[0]])).toBeNull()
  })
})
