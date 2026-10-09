/**
 * The end-of-course export.
 *
 * A course lasts a few weeks; then the application is switched off and what
 * happened must stay readable without it. Every collection is laid out once
 * here as plain tables — names and plates written out, never ids — and the
 * same tables feed both the spreadsheet files and the printed report, so the
 * two never disagree.
 */
import { csvCell } from './journal-export.js'
import { getMissionStatus } from './availability.js'
import { formatDateTime } from './datetime.js'
import { personName } from './labels.js'
import { personInMission, trailerInMission, vehicleInMission } from './retired.js'

const plateOf = item => item ? [item.plate, item.name].filter(Boolean).join(' — ') : '—'
const join = list => list.filter(Boolean).join(', ')

/**
 * @returns {Array<{key: string, title: string, headers: string[], rows: string[][]}>}
 */
export function buildTables({
  persons = [], vehicles = [], trailers = [], missions = [], requests = [], journal = null,
  now, t, requestTypeLabel = type => type.id,
}) {
  const h = keys => keys.map(key => t(`export.columns.${key}`))
  const status = value => value ? t(`status.${value}`) : ''
  const byStart = [...missions].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))

  const missionRows = byStart.map(mission => {
    const entries = mission.vehicles ?? []
    return [
      mission.title,
      formatDateTime(mission.startDate),
      formatDateTime(mission.endDate),
      status(getMissionStatus(mission, now)),
      join(entries.map(entry => {
        const trailer = trailerInMission(mission, entry.trailerId, trailers)
        const vehicle = vehicleInMission(mission, entry.vehicleId, vehicles)
        return `${vehicle?.plate ?? '—'}${trailer ? ` + ${trailer.plate}` : entry.withTrailer ? ` + ${t('export.trailer')}` : ''}`
      })),
      join(entries.map(entry => entry.driverId && personName(personInMission(mission, entry.driverId, persons)))),
      join((mission.staffIds ?? []).map(id => personName(personInMission(mission, id, persons)))),
      mission.description ?? '',
      mission.notes ?? '',
    ]
  })

  const assignmentRows = byStart.flatMap(mission => (mission.vehicles ?? []).map(entry => {
    const vehicle = vehicleInMission(mission, entry.vehicleId, vehicles)
    const trailer = trailerInMission(mission, entry.trailerId, trailers)
    return [
      mission.title,
      formatDateTime(mission.startDate),
      formatDateTime(mission.endDate),
      status(getMissionStatus(mission, now)),
      vehicle?.plate ?? '—',
      vehicle?.name ?? '',
      trailer ? plateOf(trailer) : entry.withTrailer ? t('export.trailer') : '',
      entry.driverId ? personName(personInMission(mission, entry.driverId, persons)) : '',
    ]
  }))

  const personRows = [...persons]
    .sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? ''))
    .map(person => [
      person.rank ?? '', person.firstName ?? '', person.lastName ?? '', person.phone ?? '',
      join(person.licenses ?? []),
      person.unavailable ? (person.unavailabilityNote || t('status.unavailable')) : '',
      person.notes ?? '',
    ])

  const leaveRows = persons.flatMap(person => (person.leaves ?? []).map(leave =>
    [personName(person), formatDateTime(leave.startDate), formatDateTime(leave.endDate)]))
    .sort((a, b) => a[0].localeCompare(b[0]))

  const vehicleRows = [...vehicles]
    .sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''))
    .map(vehicle => [
      vehicle.plate ?? '', vehicle.name ?? '',
      vehicle.category ? t(`vehicles.categories.${vehicle.category}`) : '',
      vehicle.seats ?? '',
      status(vehicle.status),
      vehicle.status !== 'free' ? (vehicle.loanNote ?? '') : '',
      vehicle.status !== 'free' ? formatDateTime(vehicle.loanUntil) : '',
      vehicle.keyHolder?.name ?? '',
    ])

  const trailerRows = [...trailers]
    .sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''))
    .map(trailer => [
      trailer.plate ?? '', trailer.name ?? '',
      join(trailer.compatibleTypes ?? []),
      status(trailer.status),
      trailer.status !== 'free' ? (trailer.loanNote ?? '') : '',
      trailer.status !== 'free' ? formatDateTime(trailer.loanUntil) : '',
      trailer.notes ?? '',
    ])

  const checkRows = vehicles.flatMap(vehicle => (vehicle.checks ?? []).map(check => [
    vehicle.plate ?? '', formatDateTime(check.date),
    check.personId ? personName(persons.find(person => person.id === check.personId)) : (check.note ?? ''),
    check.recordedBy ?? '',
  ])).sort((a, b) => a[0].localeCompare(b[0]) || b[1].localeCompare(a[1]))

  const requestRows = [...requests]
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map(request => [
      formatDateTime(request.createdAt),
      status(request.status),
      `${request.contact?.firstName ?? ''} ${request.contact?.lastName ?? ''}`.trim(),
      join([request.contact?.company, request.contact?.section]),
      request.contact?.phone ?? '',
      formatDateTime(request.startDate),
      formatDateTime(request.endDate),
      request.meetingPoint ?? '',
      join((request.vehicles ?? []).map(line => requestTypeLabel({ id: line.type }))),
      request.decidedBy ?? '',
      request.decisionReason ?? '',
    ])

  const movements = [
    ...(journal?.archives ?? []).flatMap(archive => archive.entries.map(entry => ({ ...entry, course: archive.name }))),
    ...(journal?.entries ?? []).map(entry => ({ ...entry, course: t('export.currentJournal') })),
  ].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || (a.sequence ?? 0) - (b.sequence ?? 0))
  const journalRows = movements.map(entry => [
    entry.course,
    formatDateTime(entry.at),
    entry.vehiclePlate ?? '', entry.vehicleName ?? '',
    t(`log.actions.${entry.action}`),
    entry.action === 'transferred' && entry.from ? t('log.fromTo', { from: entry.from, to: entry.name }) : (entry.name ?? ''),
    entry.recordedBy ?? '',
  ])

  return [
    { key: 'missions', headers: h(['title', 'start', 'end', 'status', 'vehicles', 'drivers', 'staff', 'description', 'notes']), rows: missionRows },
    { key: 'assignments', headers: h(['mission', 'start', 'end', 'status', 'plate', 'model', 'trailer', 'driver']), rows: assignmentRows },
    { key: 'vehicles', headers: h(['plate', 'model', 'category', 'seats', 'status', 'reason', 'until', 'keyHolder']), rows: vehicleRows },
    { key: 'trailers', headers: h(['plate', 'designation', 'fits', 'status', 'reason', 'until', 'notes']), rows: trailerRows },
    { key: 'persons', headers: h(['rank', 'firstName', 'lastName', 'phone', 'licenses', 'unavailable', 'notes']), rows: personRows },
    { key: 'leaves', headers: h(['person', 'start', 'end']), rows: leaveRows },
    { key: 'checks', headers: h(['plate', 'date', 'doneBy', 'recordedBy']), rows: checkRows },
    { key: 'keys', headers: h(['course', 'when', 'plate', 'model', 'movement', 'holder', 'recordedBy']), rows: journalRows },
    { key: 'requests', headers: h(['received', 'status', 'requester', 'unit', 'phone', 'start', 'end', 'meetingPoint', 'vehicles', 'decidedBy', 'reason']), rows: requestRows },
  ].map(table => ({ ...table, title: t(`export.tables.${table.key}`) }))
}

/** One table as a CSV file Excel opens directly: BOM, semicolons, CRLF. */
export function tableCsv(table) {
  return '﻿' + [table.headers, ...table.rows].map(row => row.map(csvCell).join(';')).join('\r\n')
}

// ── ZIP, stored without compression ──
// A handful of small text files: compression would buy nothing worth a
// dependency.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * @param files {Array<{name: string, content: string}>}
 * @returns {Uint8Array} a ZIP archive
 */
export function zip(files, date = new Date()) {
  const encoder = new TextEncoder()
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals = []
  const centrals = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // names are UTF-8
    local.setUint16(10, time, true)
    local.setUint16(12, day, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    locals.push(new Uint8Array(local.buffer), name, data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(12, time, true)
    central.setUint16(14, day, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    centrals.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + data.length
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.length
  }
  return out
}
