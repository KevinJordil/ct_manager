import { describe, it, expect } from 'vitest'
import { validateParkLayout, sanitizeParkLayout, decodeImageDataUrl, IMAGE_EXTENSIONS } from '../../validation.js'

const zone = (over = {}) => ({ id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.15, angle: 45, color: '#ef4444', ...over })
const layout = (over = {}) => ({ hasImage: true, zones: [zone()], colorLabels: { '#ef4444': 'Trucks' }, ...over })

describe('validateParkLayout — accepted', () => {
  it('accepts a complete layout', () => {
    expect(validateParkLayout(layout())).toBeNull()
  })

  it('accepts an empty layout', () => {
    expect(validateParkLayout({ hasImage: false, zones: [], colorLabels: {} })).toBeNull()
  })

  it('accepts omitted optional fields', () => {
    expect(validateParkLayout({})).toBeNull()
    expect(validateParkLayout({ zones: [{ id: 'z1', x: 0, y: 0, w: 1, h: 1 }] })).toBeNull()
  })

  it('accepts the bounds of the image', () => {
    expect(validateParkLayout(layout({ zones: [zone({ x: 0, y: 0, w: 1, h: 1 })] }))).toBeNull()
  })
})

describe('validateParkLayout — rejected', () => {
  it('rejects a non-object', () => {
    for (const body of [null, [], 'x', 3]) {
      expect(validateParkLayout(body)).toMatchObject({ code: 'notAnObject' })
    }
  })

  it('rejects coordinates outside the image', () => {
    for (const field of ['x', 'y', 'w', 'h']) {
      expect(validateParkLayout(layout({ zones: [zone({ [field]: 1.2 })] })))
        .toMatchObject({ code: 'invalidField', params: { index: 0, field } })
      expect(validateParkLayout(layout({ zones: [zone({ [field]: -0.1 })] })))
        .toMatchObject({ code: 'invalidField', params: { field } })
    }
  })

  it('rejects coordinates that are not numbers', () => {
    expect(validateParkLayout(layout({ zones: [zone({ x: '0.5' })] })))
      .toMatchObject({ params: { field: 'x' } })
    expect(validateParkLayout(layout({ zones: [zone({ y: NaN })] })))
      .toMatchObject({ params: { field: 'y' } })
  })

  it('rejects an angle outside 0–359', () => {
    expect(validateParkLayout(layout({ zones: [zone({ angle: 360 })] })))
      .toMatchObject({ params: { field: 'angle' } })
    expect(validateParkLayout(layout({ zones: [zone({ angle: -1 })] })))
      .toMatchObject({ params: { field: 'angle' } })
  })

  it('rejects a colour that is not a hex triplet', () => {
    for (const color of ['red', '#fff', '#gggggg', 42]) {
      expect(validateParkLayout(layout({ zones: [zone({ color })] })))
        .toMatchObject({ params: { field: 'color' } })
    }
  })

  it('rejects a zone without an identifier, or a duplicate one', () => {
    expect(validateParkLayout(layout({ zones: [zone({ id: '' })] }))).toMatchObject({ code: 'missingId' })
    expect(validateParkLayout(layout({ zones: [zone(), zone()] }))).toMatchObject({ code: 'duplicateId' })
  })

  it('caps the number of zones', () => {
    const many = Array.from({ length: 501 }, (_, i) => zone({ id: `z${i}` }))
    expect(validateParkLayout(layout({ zones: many }))).toMatchObject({ code: 'tooManyItems' })
  })

  it('rejects malformed colour labels', () => {
    expect(validateParkLayout(layout({ colorLabels: { red: 'Trucks' } })))
      .toMatchObject({ params: { field: 'colorLabels' } })
    expect(validateParkLayout(layout({ colorLabels: { '#ef4444': 42 } })))
      .toMatchObject({ params: { field: 'colorLabels' } })
    expect(validateParkLayout(layout({ colorLabels: [] })))
      .toMatchObject({ params: { field: 'colorLabels' } })
  })
})

describe('sanitizeParkLayout', () => {
  it('keeps only the known fields of a zone', () => {
    const clean = sanitizeParkLayout(layout({ zones: [zone({ label: 'legacy', extra: 1 })] }))
    expect(clean.zones[0]).toEqual({ id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.15, angle: 45, color: '#ef4444' })
  })

  it('fills in the defaults', () => {
    const clean = sanitizeParkLayout({ zones: [{ id: 'z1', x: 0, y: 0, w: 0.5, h: 0.5 }] })
    expect(clean.zones[0].angle).toBe(0)
    expect(clean.zones[0].color).toBe('#6366f1')
    expect(clean.hasImage).toBe(false)
    expect(clean.colorLabels).toEqual({})
  })
})

describe('decodeImageDataUrl', () => {
  const dataUrl = (type, content) => `data:image/${type};base64,${Buffer.from(content).toString('base64')}`

  it('accepts the three supported formats', () => {
    expect(decodeImageDataUrl(dataUrl('jpeg', 'x')).extension).toBe('jpg')
    expect(decodeImageDataUrl(dataUrl('png', 'x')).extension).toBe('png')
    expect(decodeImageDataUrl(dataUrl('webp', 'x')).extension).toBe('webp')
  })

  it('returns the decoded bytes', () => {
    const { buffer } = decodeImageDataUrl(dataUrl('png', 'hello'))
    expect(buffer.toString()).toBe('hello')
  })

  it('rejects a format that is not an image', () => {
    expect(decodeImageDataUrl('data:text/html;base64,AAAA')).toMatchObject({ code: 'invalidImage' })
  })

  it('rejects SVG, which can carry scripts', () => {
    expect(decodeImageDataUrl(dataUrl('svg+xml', '<svg/>'))).toMatchObject({ code: 'invalidImage' })
  })

  it('rejects anything that is not a data URL', () => {
    for (const value of ['/api/parc/image', '', null, 42, undefined]) {
      expect(decodeImageDataUrl(value)).toMatchObject({ code: 'invalidImage' })
    }
  })

  it('rejects an empty payload', () => {
    expect(decodeImageDataUrl('data:image/png;base64,')).toMatchObject({ code: 'invalidImage' })
  })

  it('rejects an oversized image', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(20 * 1024 * 1024)
    expect(decodeImageDataUrl(huge)).toMatchObject({ code: 'imageTooLarge' })
  })

  it('exposes the extensions the server has to clean up', () => {
    expect(IMAGE_EXTENSIONS).toEqual(['jpg', 'png', 'webp'])
  })
})
