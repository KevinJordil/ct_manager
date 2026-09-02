import { describe, it, expect } from 'vitest'
import { validateRequestSubmission, sanitizeRequestSubmission, isValidRequestStatus } from '../../validation.js'

const valid = (over = {}) => ({
  contact: { firstName: 'Jean', lastName: 'Dupont', company: 'Cp 4', section: 'Sec 2', phone: '+41 79 000 00 00' },
  startDate: '2026-09-10T08:00',
  endDate: '2026-09-10T17:00',
  meetingPoint: 'Place d\'armes',
  comment: '5 passengers',
  vehicles: [{ type: 'duro-personnel', driverRequired: true }],
  ...over,
})

describe('validateRequestSubmission — accepted', () => {
  it('accepts a complete submission', () => {
    expect(validateRequestSubmission(valid())).toBeNull()
  })

  it('accepts an omitted section and comment', () => {
    const { contact, ...rest } = valid()
    const { section: _section, ...contactRest } = contact
    const { comment: _comment, ...withoutComment } = rest
    expect(validateRequestSubmission({ ...withoutComment, contact: contactRest })).toBeNull()
  })

  it('accepts several vehicles', () => {
    expect(validateRequestSubmission(valid({
      vehicles: [
        { type: 'car', driverRequired: false },
        { type: 'truck-cargo', driverRequired: true },
      ],
    }))).toBeNull()
  })
})

describe('validateRequestSubmission — rejected', () => {
  it('rejects a non-object body', () => {
    for (const body of [null, 'text', 42, []]) {
      expect(validateRequestSubmission(body)).toMatchObject({ code: 'notAnObject' })
    }
  })

  it('requires every contact field but the section', () => {
    for (const field of ['firstName', 'lastName', 'company', 'phone']) {
      const body = valid()
      delete body.contact[field]
      expect(validateRequestSubmission(body)).toMatchObject({ code: 'invalidField', params: { field } })
    }
  })

  it('rejects blank strings, not just missing ones', () => {
    const body = valid()
    body.contact.firstName = '   '
    expect(validateRequestSubmission(body)).toMatchObject({ params: { field: 'firstName' } })
  })

  it('rejects malformed dates', () => {
    expect(validateRequestSubmission(valid({ startDate: '10.09.2026' }))).toMatchObject({ code: 'invalidDates' })
    expect(validateRequestSubmission(valid({ endDate: '' }))).toMatchObject({ code: 'invalidDates' })
  })

  it('rejects an end before the start', () => {
    expect(validateRequestSubmission(valid({
      startDate: '2026-09-10T17:00', endDate: '2026-09-10T08:00',
    }))).toMatchObject({ code: 'endBeforeStart' })
  })

  it('requires a meeting point', () => {
    expect(validateRequestSubmission(valid({ meetingPoint: '' })))
      .toMatchObject({ code: 'invalidField', params: { field: 'meetingPoint' } })
  })

  it('requires at least one vehicle', () => {
    expect(validateRequestSubmission(valid({ vehicles: [] })))
      .toMatchObject({ code: 'invalidField', params: { field: 'vehicles' } })
    expect(validateRequestSubmission(valid({ vehicles: 'car' })))
      .toMatchObject({ code: 'invalidField', params: { field: 'vehicles' } })
  })

  it('rejects an unknown vehicle type', () => {
    expect(validateRequestSubmission(valid({ vehicles: [{ type: 'tank' }] })))
      .toMatchObject({ code: 'invalidNested', params: { position: 0, field: 'type' } })
  })

  it('caps the number of vehicles', () => {
    const many = Array.from({ length: 21 }, () => ({ type: 'car', driverRequired: false }))
    expect(validateRequestSubmission(valid({ vehicles: many }))).toMatchObject({ code: 'tooManyItems' })
  })

  it('bounds the length of free text', () => {
    expect(validateRequestSubmission(valid({ meetingPoint: 'x'.repeat(201) })))
      .toMatchObject({ params: { field: 'meetingPoint' } })
  })
})

describe('sanitizeRequestSubmission', () => {
  it('keeps only the known fields', () => {
    const clean = sanitizeRequestSubmission(valid({
      status: 'approved', id: 'forged', createdAt: '1999-01-01T00:00',
    }))
    expect(clean).not.toHaveProperty('status')
    expect(clean).not.toHaveProperty('id')
    expect(clean).not.toHaveProperty('createdAt')
  })

  it('trims the text and normalises the flags', () => {
    const clean = sanitizeRequestSubmission(valid({
      meetingPoint: '  Place  ',
      vehicles: [{ type: 'car', driverRequired: 'yes' }],
    }))
    expect(clean.meetingPoint).toBe('Place')
    expect(clean.vehicles[0].driverRequired).toBe(true)
  })

  it('defaults the optional fields to empty strings', () => {
    const body = valid()
    delete body.contact.section
    delete body.comment
    const clean = sanitizeRequestSubmission(body)
    expect(clean.contact.section).toBe('')
    expect(clean.comment).toBe('')
  })
})

describe('isValidRequestStatus', () => {
  it('accepts the three known statuses', () => {
    for (const status of ['pending', 'approved', 'rejected']) {
      expect(isValidRequestStatus(status)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    for (const status of ['done', '', null, undefined, 42]) {
      expect(isValidRequestStatus(status)).toBe(false)
    }
  })
})
