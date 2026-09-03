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
const REQUEST_STATUSES = ['pending', 'approved', 'rejected']
const BUILT_IN_REQUEST_VEHICLE_TYPES = [
  'car', 'van-9', 'class-g', 'duro-personnel', 'duro-cargo',
  'truck-personnel', 'truck-cargo', 'other',
]

const MAX_REQUEST_VEHICLES = 20

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
  if (!isOptionalText(p.phone)) return invalidField('phone')
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
  if (v.loanUntil !== undefined && v.loanUntil !== null && v.loanUntil !== '' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(v.loanUntil)) {
    return invalidField('loanUntil')
  }
  if (v.seats !== undefined && (!Number.isInteger(v.seats) || v.seats < 0 || v.seats > 200)) {
    return invalidField('seats')
  }

  if (v.checks !== undefined) {
    if (!Array.isArray(v.checks)) return invalidField('checks')
    for (const [i, check] of v.checks.entries()) {
      if (check === null || typeof check !== 'object') {
        return { code: 'invalidNested', params: { list: 'checks', position: i, field: '' } }
      }
      if (!isText(check.id)) {
        return { code: 'invalidNested', params: { list: 'checks', position: i, field: 'id' } }
      }
      if (typeof check.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(check.date)) {
        return { code: 'invalidNested', params: { list: 'checks', position: i, field: 'date' } }
      }
      if (check.personId !== null && check.personId !== undefined && !isText(check.personId)) {
        return { code: 'invalidNested', params: { list: 'checks', position: i, field: 'personId' } }
      }
      if (!isOptionalText(check.note)) {
        return { code: 'invalidNested', params: { list: 'checks', position: i, field: 'note' } }
      }
    }
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

// ── Public request form ──

const isRequired = v => typeof v === 'string' && v.trim() !== '' && v.length <= 200
const isDateTime = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)

/**
 * Validates a submission from the public form.
 *
 * This is the only route open without a session, so it is validated more
 * strictly than the rest: every field is bounded, and only known vehicle
 * types are accepted.
 *
 * @param allowedTypes the configured type ids; defaults to the built-in set
 * @returns {{code: string, params: object}|null}
 */
export function validateRequestSubmission(body, allowedTypes = BUILT_IN_REQUEST_VEHICLE_TYPES) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { code: 'notAnObject', params: {} }
  }

  const contact = body.contact
  if (contact === null || typeof contact !== 'object' || Array.isArray(contact)) {
    return invalidField('contact')
  }
  for (const field of ['firstName', 'lastName', 'company', 'phone']) {
    if (!isRequired(contact[field])) return invalidField(field)
  }
  if (contact.section !== undefined && !isOptionalText(contact.section)) return invalidField('section')

  if (!isDateTime(body.startDate) || !isDateTime(body.endDate)) {
    return { code: 'invalidDates', params: {} }
  }
  if (body.endDate < body.startDate) return { code: 'endBeforeStart', params: {} }
  if (!isRequired(body.meetingPoint)) return invalidField('meetingPoint')
  if (body.comment !== undefined && !isOptionalText(body.comment)) return invalidField('comment')

  if (!Array.isArray(body.vehicles) || body.vehicles.length === 0) {
    return invalidField('vehicles')
  }
  if (body.vehicles.length > MAX_REQUEST_VEHICLES) {
    return { code: 'tooManyItems', params: { max: MAX_REQUEST_VEHICLES } }
  }
  for (const [position, entry] of body.vehicles.entries()) {
    if (entry === null || typeof entry !== 'object') {
      return { code: 'invalidNested', params: { list: 'vehicles', position, field: '' } }
    }
    if (!allowedTypes.includes(entry.type)) {
      return { code: 'invalidNested', params: { list: 'vehicles', position, field: 'type' } }
    }
    if (!isOptionalBoolean(entry.driverRequired)) {
      return { code: 'invalidNested', params: { list: 'vehicles', position, field: 'driverRequired' } }
    }
  }
  return null
}

/** Keeps only the known fields, so nothing extra reaches the stored file. */
export function sanitizeRequestSubmission(body) {
  return {
    contact: {
      firstName: body.contact.firstName.trim(),
      lastName: body.contact.lastName.trim(),
      company: body.contact.company.trim(),
      section: (body.contact.section ?? '').trim(),
      phone: body.contact.phone.trim(),
    },
    startDate: body.startDate,
    endDate: body.endDate,
    meetingPoint: body.meetingPoint.trim(),
    comment: (body.comment ?? '').trim(),
    vehicles: body.vehicles.map(entry => ({
      type: entry.type,
      driverRequired: Boolean(entry.driverRequired),
    })),
  }
}

export function isValidRequestStatus(status) {
  return REQUEST_STATUSES.includes(status)
}

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

// ── Vehicle park layout ──

const MAX_ZONES = 500
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const isFraction = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/**
 * Validates the park layout: zones drawn over the site plan, expressed as
 * fractions of the image so they survive any resize, plus the label given to
 * each colour.
 *
 * @returns {{code: string, params: object}|null}
 */
export function validateParkLayout(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { code: 'notAnObject', params: {} }
  }
  if (!isOptionalBoolean(body.hasImage)) return invalidField('hasImage')

  const zones = body.zones ?? []
  if (!Array.isArray(zones)) return invalidField('zones')
  if (zones.length > MAX_ZONES) return { code: 'tooManyItems', params: { max: MAX_ZONES } }

  const seen = new Set()
  for (const [index, zone] of zones.entries()) {
    if (zone === null || typeof zone !== 'object') return { code: 'notAnObject', params: { index } }
    if (!isText(zone.id) || zone.id === '') return { code: 'missingId', params: { index } }
    if (seen.has(zone.id)) return { code: 'duplicateId', params: { index, id: zone.id } }
    seen.add(zone.id)

    for (const field of ['x', 'y', 'w', 'h']) {
      if (!isFraction(zone[field])) return { code: 'invalidField', params: { index, field } }
    }
    if (zone.angle !== undefined &&
        (typeof zone.angle !== 'number' || !Number.isFinite(zone.angle) || zone.angle < 0 || zone.angle >= 360)) {
      return { code: 'invalidField', params: { index, field: 'angle' } }
    }
    if (zone.color !== undefined && !HEX_COLOR.test(zone.color)) {
      return { code: 'invalidField', params: { index, field: 'color' } }
    }
  }

  const labels = body.colorLabels ?? {}
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) {
    return invalidField('colorLabels')
  }
  for (const [color, label] of Object.entries(labels)) {
    if (!HEX_COLOR.test(color) || !isText(label)) return invalidField('colorLabels')
  }
  return null
}

/** Keeps only the known fields of the layout. */
export function sanitizeParkLayout(body) {
  return {
    hasImage: Boolean(body.hasImage),
    zones: (body.zones ?? []).map(zone => ({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      angle: zone.angle ?? 0,
      color: zone.color ?? '#6366f1',
    })),
    colorLabels: { ...(body.colorLabels ?? {}) },
  }
}

// ── Park image ──

const IMAGE_TYPES = { jpeg: 'jpg', png: 'png', webp: 'webp' }
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/**
 * Accepts a data URL and returns the bytes to write.
 * @returns {{extension: string, buffer: Buffer}|{code: string, params: object}}
 */
export function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { code: 'invalidImage', params: {} }
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return { code: 'invalidImage', params: {} }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) return { code: 'invalidImage', params: {} }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { code: 'imageTooLarge', params: { max: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) } }
  }
  return { extension: IMAGE_TYPES[match[1]], buffer }
}

export const IMAGE_EXTENSIONS = Object.values(IMAGE_TYPES)

// ── Runtime configuration ──

const CONFIGURABLE_CATEGORIES = ['light-road', 'light-offroad', 'medium', 'heavy']
const MAX_CONFIG_ENTRIES = 100
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/

/**
 * Validates the configuration an operator may edit.
 * @returns {{code: string, params: object}|null}
 */
export function validateConfig(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { code: 'notAnObject', params: {} }
  }

  const types = body.requestVehicleTypes
  if (!Array.isArray(types)) return invalidField('requestVehicleTypes')
  if (types.length === 0) return { code: 'emptyList', params: { field: 'requestVehicleTypes' } }
  if (types.length > MAX_CONFIG_ENTRIES) return { code: 'tooManyItems', params: { max: MAX_CONFIG_ENTRIES } }

  const seen = new Set()
  for (const [index, type] of types.entries()) {
    if (type === null || typeof type !== 'object') return { code: 'notAnObject', params: { index } }
    if (!ID_PATTERN.test(type.id ?? '')) return { code: 'invalidField', params: { index, field: 'id' } }
    if (seen.has(type.id)) return { code: 'duplicateId', params: { index, id: type.id } }
    seen.add(type.id)
    if (type.label !== undefined && !isText(type.label)) {
      return { code: 'invalidField', params: { index, field: 'label' } }
    }
  }

  if (!Array.isArray(body.licenses)) return invalidField('licenses')
  if (body.licenses.length === 0) return { code: 'emptyList', params: { field: 'licenses' } }
  if (!body.licenses.every(code => ID_PATTERN.test(code ?? ''))) return invalidField('licenses')

  for (const field of ['licensesByCategory', 'trailerLicensesByCategory']) {
    const matrix = body[field]
    if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) return invalidField(field)
    for (const [category, codes] of Object.entries(matrix)) {
      if (!CONFIGURABLE_CATEGORIES.includes(category)) {
        return { code: 'unknownValue', params: { field: category } }
      }
      if (!Array.isArray(codes) || !codes.every(code => body.licenses.includes(code))) {
        return { code: 'unknownLicense', params: { field: category } }
      }
    }
  }
  return null
}
