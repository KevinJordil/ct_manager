/**
 * Migration of stored data to the current schema.
 *
 * Applied on every load, so it must be idempotent: records already in the
 * current shape are returned untouched. Historic shapes are recognised by
 * the fields they carry, never by a version counter, so that files written
 * by any earlier release can still be read.
 */

import { withDefaultTime } from './datetime.js'
import { VEHICLE_CATEGORY, VEHICLE_STATUS } from './constants.js'

// ── Value maps from the French schema ──

const LEGACY_LICENSES = { B: '920', BE: '920E', C: '930', CE: '930E' }

const LEGACY_CATEGORIES = {
  'léger': VEHICLE_CATEGORY.LIGHT_ROAD,
  'léger-route': VEHICLE_CATEGORY.LIGHT_ROAD,
  'léger-tt': VEHICLE_CATEGORY.LIGHT_OFFROAD,
  'moyen': VEHICLE_CATEGORY.MEDIUM,
  'lourd': VEHICLE_CATEGORY.HEAVY,
}

const LEGACY_VEHICLE_STATUSES = {
  'libre': VEHICLE_STATUS.FREE,
  'en prêt': VEHICLE_STATUS.ON_LOAN,
  // 'en mission' used to be stored; it is derived from the missions now.
  'en mission': VEHICLE_STATUS.FREE,
}

// ── Persons ──

function migratePerson(raw) {
  if (raw.firstName !== undefined || raw.lastName !== undefined) {
    return {
      ...raw,
      rank: raw.rank ?? '',
      phone: raw.phone ?? '',
      licenses: raw.licenses ?? [],
      notes: raw.notes ?? '',
      leaves: (raw.leaves ?? []).map(normaliseLeave),
      unavailable: raw.unavailable ?? false,
      unavailabilityNote: raw.unavailabilityNote ?? '',
    }
  }

  // Oldest shape: a plain "statut" string instead of a list of leaves.
  const legacyLeaves = raw.conges ?? (raw.statut === 'en congé'
    ? [{ id: `mig-${raw.id}`, dateDebut: '2026-01-01T00:00', dateFin: '2099-12-31T23:59' }]
    : [])

  return {
    id: raw.id,
    rank: raw.grade ?? '',
    phone: raw.telephone ?? '',
    firstName: raw.prenom ?? '',
    lastName: raw.nom ?? '',
    licenses: (raw.permis ?? []).map(code => LEGACY_LICENSES[code] ?? code),
    notes: raw.notes ?? '',
    leaves: legacyLeaves.map(l => normaliseLeave({
      id: l.id,
      startDate: l.startDate ?? l.dateDebut,
      endDate: l.endDate ?? l.dateFin,
    })),
    unavailable: raw.indisponible ?? false,
    unavailabilityNote: raw.commentaireIndisponible ?? '',
  }
}

function normaliseLeave(leave) {
  return {
    ...leave,
    startDate: withDefaultTime(leave.startDate, '00:00'),
    endDate: withDefaultTime(leave.endDate, '23:59'),
  }
}

export function migratePersons(data) {
  return data.map(migratePerson)
}

// ── Vehicles ──

/** Weekly checks were stored as "sph", with a French comment field. */
function migrateChecks(raw) {
  const source = raw.checks ?? raw.sph ?? []
  return source.map(check => ({
    id: check.id,
    date: check.date,
    personId: check.personId ?? null,
    note: check.note ?? check.commentaire ?? '',
  }))
}

function migrateVehicle(raw) {
  if (raw.plate !== undefined || raw.category !== undefined) {
    const { sph: _dropped, ...rest } = raw
    return {
      ...rest,
      name: rest.name ?? '',
      plate: rest.plate ?? '',
      status: rest.status === VEHICLE_STATUS.ON_LOAN ? VEHICLE_STATUS.ON_LOAN : VEHICLE_STATUS.FREE,
      loanNote: rest.loanNote ?? '',
      loanUntil: rest.loanUntil ?? '',
      seats: rest.seats ?? 4,
      checks: migrateChecks(raw),
      keyHolder: rest.keyHolder ?? null,
      keyHistory: rest.keyHistory ?? [],
    }
  }

  return {
    id: raw.id,
    name: raw.nom ?? '',
    plate: raw.immatriculation ?? '',
    category: LEGACY_CATEGORIES[raw.categorie] ?? raw.categorie,
    status: LEGACY_VEHICLE_STATUSES[raw.statut] ?? VEHICLE_STATUS.FREE,
    loanNote: raw.commentairePret ?? '',
    loanUntil: '',
    seats: raw.places ?? 4,
    checks: migrateChecks(raw),
    keyHolder: null,
    keyHistory: [],
  }
}

export function migrateVehicles(data) {
  return data.map(migrateVehicle)
}

// ── Missions ──

function migrateMission(raw) {
  if (raw.title !== undefined) {
    // The status is always recomputed from the dates; drop any stored one.
    const { status: _dropped, ...rest } = raw
    return {
      ...rest,
      description: rest.description ?? '',
      notes: rest.notes ?? '',
      vehicles: (rest.vehicles ?? []).map(v => ({
        ...v,
        driverId: v.driverId ?? null,
        withTrailer: v.withTrailer ?? false,
      })),
      staffIds: rest.staffIds ?? [],
    }
  }

  // Oldest shape: a single vehiculeId/chauffeurId pair instead of a list.
  const legacyVehicles = raw.vehicules ?? (raw.vehiculeId
    ? [{ id: `mig-${raw.id}`, vehiculeId: raw.vehiculeId, chauffeurId: raw.chauffeurId || null }]
    : [])

  return {
    id: raw.id,
    title: raw.titre ?? '',
    description: raw.description ?? '',
    startDate: withDefaultTime(raw.dateDebut, '08:00'),
    endDate: withDefaultTime(raw.dateFin, '17:00'),
    notes: raw.notes ?? '',
    vehicles: legacyVehicles.map(v => ({
      id: v.id,
      vehicleId: v.vehiculeId ?? v.vehicleId,
      driverId: v.chauffeurId ?? v.driverId ?? null,
      withTrailer: v.avecRemorque ?? v.withTrailer ?? false,
    })),
    staffIds: raw.personnes ?? [],
  }
}

export function migrateMissions(data) {
  return data.map(migrateMission)
}

export const MIGRATIONS = {
  persons: migratePersons,
  vehicles: migrateVehicles,
  missions: migrateMissions,
}
