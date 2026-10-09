import { describe, it, expect } from 'vitest'
import { buildTables, tableCsv, zip } from '../export.js'

const t = (key, params) => params ? `${key}:${JSON.stringify(params)}` : key

const base = {
  persons: [{ id: 'p1', rank: 'Sgt', firstName: 'Caroline', lastName: 'Favre', licenses: ['930'], leaves: [] }],
  vehicles: [{ id: 'v1', plate: 'M1', name: 'Duro', category: 'medium', type: 'duro', status: 'free', checks: [] }],
  trailers: [{ id: 't1', plate: 'M70101', name: 'Remorque 1 t', compatibleTypes: ['duro', 'class-g'], status: 'free' }],
  missions: [{
    id: 'm1', title: 'Transport', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
    vehicles: [
      { vehicleId: 'v1', driverId: 'p1', withTrailer: true, trailerId: 't1' },
      { vehicleId: 'gone', driverId: 'left' },
    ],
    staffIds: [],
    retiredVehicles: { gone: { plate: 'M99', name: 'Pinzgauer' } },
    retiredPersons: { left: { rank: 'Cpl', firstName: 'Marc', lastName: 'Ancien' } },
  }],
  now: '2026-09-10T00:00', t,
  vehicleTypeLabel: id => ({ duro: 'Duro', 'class-g': 'Class G' })[id] ?? id,
}

describe('end-of-course tables', () => {
  it('writes names and plates out, deleted ones included', () => {
    const missions = buildTables(base).find(table => table.key === 'missions')
    expect(missions.rows[0]).toEqual(expect.arrayContaining(['Transport', 'M1 + M70101, M99', 'Sgt Caroline Favre, Cpl Marc Ancien']))
  })

  it('says behind which models a trailer goes', () => {
    const trailers = buildTables(base).find(table => table.key === 'trailers')
    expect(trailers.rows[0]).toEqual(expect.arrayContaining(['M70101', 'Duro, Class G']))
  })

  it('keeps a spreadsheet from running a name as a formula', () => {
    const tables = buildTables({ ...base, persons: [{ ...base.persons[0], lastName: '=HYPERLINK("x")' }] })
    const csv = tableCsv(tables.find(table => table.key === 'persons'))
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('zip', () => {
  it('produces an archive holding every file', () => {
    const bytes = zip([{ name: '01-missions.csv', content: 'a;b' }, { name: 'é.csv', content: 'ü' }])
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    // The end-of-directory record counts both files.
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(2)
    expect(new TextDecoder().decode(bytes)).toContain('01-missions.csv')
  })
})
