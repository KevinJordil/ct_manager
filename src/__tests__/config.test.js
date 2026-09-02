import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, withDefaults, isBuiltInRequestType } from '../config.js'
import { validateConfig, validateRequestSubmission } from '../../validation.js'
import { VEHICLE_CATEGORIES } from '../constants.js'

describe('withDefaults', () => {
  it('returns a complete configuration from nothing', () => {
    const config = withDefaults()
    expect(config.requestVehicleTypes.length).toBeGreaterThan(0)
    expect(config.licenses).toEqual(DEFAULT_CONFIG.licenses)
    expect(Object.keys(config.licensesByCategory).sort()).toEqual([...VEHICLE_CATEGORIES].sort())
  })

  it('keeps the stored overrides', () => {
    const config = withDefaults({ licenses: ['920', '940'] })
    expect(config.licenses).toEqual(['920', '940'])
  })

  it('falls back field by field, so a partial file still works', () => {
    const config = withDefaults({ licenses: ['920'] })
    expect(config.requestVehicleTypes).toEqual(DEFAULT_CONFIG.requestVehicleTypes)
    expect(config.licensesByCategory.medium).toEqual(DEFAULT_CONFIG.licensesByCategory.medium)
  })

  it('completes a partial licence matrix', () => {
    const config = withDefaults({ licensesByCategory: { medium: ['930'] } })
    expect(config.licensesByCategory.medium).toEqual(['930'])
    expect(config.licensesByCategory.heavy).toEqual(DEFAULT_CONFIG.licensesByCategory.heavy)
  })

  it('drops malformed entries rather than failing', () => {
    const config = withDefaults({ requestVehicleTypes: [{ id: 'ok' }, {}, null, { id: '' }] })
    expect(config.requestVehicleTypes).toEqual([{ id: 'ok' }])
  })

  it('falls back when the stored list is empty', () => {
    expect(withDefaults({ licenses: [] }).licenses).toEqual(DEFAULT_CONFIG.licenses)
    expect(withDefaults({ requestVehicleTypes: [] }).requestVehicleTypes)
      .toEqual(DEFAULT_CONFIG.requestVehicleTypes)
  })

  it('does not share arrays with the defaults', () => {
    const config = withDefaults()
    config.licenses.push('999')
    expect(DEFAULT_CONFIG.licenses).not.toContain('999')
  })
})

describe('isBuiltInRequestType', () => {
  it('recognises the shipped types', () => {
    expect(isBuiltInRequestType('duro-personnel')).toBe(true)
    expect(isBuiltInRequestType('minibus')).toBe(false)
  })
})

describe('validateConfig', () => {
  const valid = (over = {}) => ({ ...DEFAULT_CONFIG, ...over })

  it('accepts the defaults', () => {
    expect(validateConfig(valid())).toBeNull()
  })

  it('accepts a custom type with a label', () => {
    expect(validateConfig(valid({
      requestVehicleTypes: [{ id: 'minibus', label: 'Minibus 20 places' }],
    }))).toBeNull()
  })

  it('refuses empty lists', () => {
    expect(validateConfig(valid({ requestVehicleTypes: [] })))
      .toMatchObject({ code: 'emptyList', params: { field: 'requestVehicleTypes' } })
    expect(validateConfig(valid({ licenses: [] })))
      .toMatchObject({ code: 'emptyList', params: { field: 'licenses' } })
  })

  it('refuses an identifier with unusable characters', () => {
    for (const id of ['a b', 'é', '', 'x'.repeat(41)]) {
      expect(validateConfig(valid({ requestVehicleTypes: [{ id }] })))
        .toMatchObject({ code: 'invalidField', params: { field: 'id' } })
    }
  })

  it('refuses duplicate identifiers', () => {
    expect(validateConfig(valid({ requestVehicleTypes: [{ id: 'car' }, { id: 'car' }] })))
      .toMatchObject({ code: 'duplicateId' })
  })

  it('refuses an unknown category in the matrix', () => {
    expect(validateConfig(valid({ licensesByCategory: { tank: ['930'] } })))
      .toMatchObject({ code: 'unknownValue', params: { field: 'tank' } })
  })

  it('refuses a matrix referring to a licence that does not exist', () => {
    expect(validateConfig(valid({
      licenses: ['920'],
      licensesByCategory: { medium: ['930'] },
    }))).toMatchObject({ code: 'unknownLicense', params: { field: 'medium' } })
  })

  it('refuses a body that is not an object', () => {
    for (const body of [null, [], 'x']) {
      expect(validateConfig(body)).toMatchObject({ code: 'notAnObject' })
    }
  })
})

describe('request validation follows the configuration', () => {
  const submission = type => ({
    contact: { firstName: 'A', lastName: 'B', company: 'C', phone: '+41' },
    startDate: '2026-09-10T08:00',
    endDate: '2026-09-10T17:00',
    meetingPoint: 'Place',
    vehicles: [{ type, driverRequired: false }],
  })

  it('accepts a built-in type by default', () => {
    expect(validateRequestSubmission(submission('car'))).toBeNull()
  })

  it('rejects a custom type when it is not configured', () => {
    expect(validateRequestSubmission(submission('minibus')))
      .toMatchObject({ code: 'invalidNested', params: { field: 'type' } })
  })

  it('accepts a custom type once it is configured', () => {
    expect(validateRequestSubmission(submission('minibus'), ['minibus'])).toBeNull()
  })

  it('rejects a built-in type that has been removed from the configuration', () => {
    expect(validateRequestSubmission(submission('car'), ['minibus']))
      .toMatchObject({ code: 'invalidNested', params: { field: 'type' } })
  })
})
