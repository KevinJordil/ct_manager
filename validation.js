/**
 * Validation of the collections received by the API.
 *
 * The server replaces the whole file on every PUT: without validation, a
 * malformed request (or a client bug) would silently destroy the data.
 *
 * Errors are returned as {code, params} rather than prose, so the interface
 * can render them in the reader's language.
 */

const MAX_ITEMS = 5000
const MAX_TEXT = 5000

const CATEGORIES = ['light-road', 'light-offroad', 'medium', 'heavy']
const VEHICLE_STATUSES = ['free', 'on-loan']

const isText = v => typeof v === 'string' && v.length <= MAX_TEXT
const isOptionalText = v => v === undefined || v === null || isText(v)
const isOptionalBoolean = v => v === undefined || typeof v === 'boolean'
const isOptionalDate = v => v === undefined || v === null || v === '' ||
  (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v))
const isOptionalTextList = v => v === undefined || (Array.isArray(v) && v.every(isText))

const invalidField = field => ({ code: 'invalidField', params: { field } })

// ── Per-entity rules ──

function validateCommon(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return { code: 'notAnObject', params: {} }
  }
  if (!isText(item.id) || item.id === '') return { code: 'missingId', params: {} }
  return null
}

function validatePerson(p) {
  const common = validateCommon(p)
  if (common) return common
  if (!isText(p.lastName)) return invalidField('lastName')
  if (!isText(p.firstName)) return invalidField('firstName')
  if (!isOptionalText(p.rank)) return invalidField('rank')
  if (!isOptionalText(p.notes)) return invalidField('notes')
  if (!isOptionalTextList(p.licenses)) return invalidField('licenses')
  if (!isOptionalBoolean(p.unavailable)) return invalidField('unavailable')
  if (!isOptionalText(p.unavailabilityNote)) return invalidField('unavailabilityNote')

  if (p.leaves !== undefined) {
    if (!Array.isArray(p.leaves)) return invalidField('leaves')
    for (const [i, leave] of p.leaves.entries()) {
      if (leave === null || typeof leave !== 'object') {
        return { code: 'invalidNested', params: { list: 'leaves', position: i, field: '' } }
      }
      if (!isText(leave.id)) {
        return { code: 'invalidNested', params: { list: 'leaves', position: i, field: 'id' } }
      }
      if (!isOptionalDate(leave.startDate) || !isOptionalDate(leave.endDate)) {
        return { code: 'invalidNested', params: { list: 'leaves', position: i, field: 'dates' } }
      }
    }
  }
  return null
}

function validateVehicle(v) {
  const common = validateCommon(v)
  if (common) return common
  if (!isText(v.name)) return invalidField('name')
  if (!isOptionalText(v.plate)) return invalidField('plate')
  if (v.category !== undefined && !CATEGORIES.includes(v.category)) {
    return { code: 'unknownValue', params: { field: 'category' } }
  }
  if (v.status !== undefined && !VEHICLE_STATUSES.includes(v.status)) {
    return { code: 'unknownValue', params: { field: 'status' } }
  }
  if (!isOptionalText(v.loanNote)) return invalidField('loanNote')
  if (v.seats !== undefined && (!Number.isInteger(v.seats) || v.seats < 0 || v.seats > 200)) {
    return invalidField('seats')
  }
  return null
}

function validateMission(m) {
  const common = validateCommon(m)
  if (common) return common
  if (!isText(m.title)) return invalidField('title')
  if (!isOptionalText(m.description)) return invalidField('description')
  if (!isOptionalText(m.notes)) return invalidField('notes')
  if (!isOptionalDate(m.startDate) || !isOptionalDate(m.endDate)) {
    return { code: 'invalidDates', params: {} }
  }

  if (m.vehicles !== undefined) {
    if (!Array.isArray(m.vehicles)) return invalidField('vehicles')
    for (const [i, entry] of m.vehicles.entries()) {
      if (entry === null || typeof entry !== 'object') {
        return { code: 'invalidNested', params: { list: 'vehicles', position: i, field: '' } }
      }
      if (!isText(entry.vehicleId)) {
        return { code: 'invalidNested', params: { list: 'vehicles', position: i, field: 'vehicleId' } }
      }
      if (entry.driverId !== null && entry.driverId !== undefined && !isText(entry.driverId)) {
        return { code: 'invalidNested', params: { list: 'vehicles', position: i, field: 'driverId' } }
      }
      if (!isOptionalBoolean(entry.withTrailer)) {
        return { code: 'invalidNested', params: { list: 'vehicles', position: i, field: 'withTrailer' } }
      }
    }
  }
  if (!isOptionalTextList(m.staffIds)) return invalidField('staffIds')
  return null
}

const VALIDATORS = {
  persons: validatePerson,
  vehicles: validateVehicle,
  missions: validateMission,
}

export const ENTITIES = Object.keys(VALIDATORS)

/**
 * Validates a whole collection.
 * @returns {{code: string, params: object}|null} null when everything is valid
 */
export function validateCollection(entity, data) {
  const validate = VALIDATORS[entity]
  if (!validate) return { code: 'unknownCollection', params: { entity } }
  if (!Array.isArray(data)) return { code: 'notAnArray', params: {} }
  if (data.length > MAX_ITEMS) return { code: 'tooManyItems', params: { max: MAX_ITEMS } }

  const seen = new Set()
  for (const [index, item] of data.entries()) {
    const error = validate(item)
    if (error) return { ...error, params: { ...error.params, index } }
    if (seen.has(item.id)) return { code: 'duplicateId', params: { index, id: item.id } }
    seen.add(item.id)
  }
  return null
}
