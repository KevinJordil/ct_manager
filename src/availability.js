/**
 * Business rules for mission status and resource availability.
 *
 * These functions are pure: the reference instant is always passed in (`now`,
 * as a local "YYYY-MM-DDTHH:mm" string). That keeps them testable and lets
 * components depend on a reactive clock (see stores/clock.js) rather than
 * calling `new Date()` inside a computed, which would stop Vue from
 * recomputing statuses as time passes.
 */

import { nowString, overlaps } from './datetime.js'
import { MISSION_STATUS, PERSON_STATUS, VEHICLE_STATUS } from './constants.js'

// ── Missions ──

/** Mission status, derived from its dates */
export function getMissionStatus(mission, now = nowString()) {
  if (!mission?.startDate || !mission?.endDate) return MISSION_STATUS.PLANNED
  if (mission.endDate < now) return MISSION_STATUS.COMPLETED
  if (mission.startDate <= now) return MISSION_STATUS.ONGOING
  return MISSION_STATUS.PLANNED
}

export function ongoingMissions(missions, now = nowString()) {
  return missions.filter(m => getMissionStatus(m, now) === MISSION_STATUS.ONGOING)
}

/** Does the mission involve this person, as a driver or as unmounted staff? */
export function missionInvolvesPerson(mission, personId) {
  return Boolean(
    mission.vehicles?.some(v => v.driverId === personId) ||
    mission.staffIds?.includes(personId)
  )
}

/** Does the mission involve this vehicle? */
export function missionInvolvesVehicle(mission, vehicleId) {
  return Boolean(mission.vehicles?.some(v => v.vehicleId === vehicleId))
}

// ── Leave and unavailability ──

/** Is the person on leave at a given instant? */
export function isOnLeaveAt(person, now = nowString()) {
  return Boolean(person.leaves?.some(l => l.startDate <= now && now <= l.endDate))
}

/** Does the person have a leave overlapping the period? */
export function isOnLeaveDuring(person, startDate, endDate) {
  if (!startDate || !endDate || !person.leaves?.length) return false
  return person.leaves.some(l => overlaps(l.startDate, l.endDate, startDate, endDate))
}

/** Base person status: available | on-leave | unavailable */
export function getPersonStatus(person, now = nowString()) {
  if (person.unavailable) return PERSON_STATUS.UNAVAILABLE
  return isOnLeaveAt(person, now) ? PERSON_STATUS.ON_LEAVE : PERSON_STATUS.AVAILABLE
}

// ── Commitments over a period ──

/**
 * Missions overlapping the given period.
 * `excludeMissionId` skips the mission currently being edited.
 */
export function missionsOverlapping(missions, startDate, endDate, { excludeMissionId = null } = {}) {
  return missions.filter(m =>
    m.id !== excludeMissionId && overlaps(m.startDate, m.endDate, startDate, endDate)
  )
}

/** Is the person already committed to a mission overlapping the period? */
export function isPersonCommitted(personId, missions, startDate, endDate, options = {}) {
  return missionsOverlapping(missions, startDate, endDate, options)
    .some(m => missionInvolvesPerson(m, personId))
}

/** Is the vehicle already committed to a mission overlapping the period? */
export function isVehicleCommitted(vehicleId, missions, startDate, endDate, options = {}) {
  return missionsOverlapping(missions, startDate, endDate, options)
    .some(m => missionInvolvesVehicle(m, vehicleId))
}

// ── Displayed statuses, accounting for ongoing missions ──

/** Ongoing mission involving this person, or undefined */
export function currentMissionOfPerson(personId, missions, now = nowString()) {
  return ongoingMissions(missions, now).find(m => missionInvolvesPerson(m, personId))
}

/** Ongoing mission involving this vehicle, or undefined */
export function currentMissionOfVehicle(vehicleId, missions, now = nowString()) {
  return ongoingMissions(missions, now).find(m => missionInvolvesVehicle(m, vehicleId))
}

/** available | on-mission | on-leave | unavailable */
export function getDisplayedPersonStatus(person, missions, now = nowString()) {
  const base = getPersonStatus(person, now)
  if (base !== PERSON_STATUS.AVAILABLE) return base
  return currentMissionOfPerson(person.id, missions, now)
    ? PERSON_STATUS.ON_MISSION
    : PERSON_STATUS.AVAILABLE
}

/** free | on-mission | on-loan */
export function getVehicleStatus(vehicle, missions, now = nowString()) {
  if (vehicle.status === VEHICLE_STATUS.ON_LOAN) return VEHICLE_STATUS.ON_LOAN
  return currentMissionOfVehicle(vehicle.id, missions, now)
    ? VEHICLE_STATUS.ON_MISSION
    : VEHICLE_STATUS.FREE
}

// ── Availability for assignment to a mission ──

/**
 * Can the person be assigned to a mission over this period?
 * `excludeMissionId`: the mission being edited, whose current assignments
 * must not count as conflicts.
 */
export function isPersonAvailable(person, missions, startDate, endDate, options = {}) {
  const { excludeMissionId = null, now = nowString() } = options
  if (person.unavailable) return false
  if (!startDate || !endDate) return !isOnLeaveAt(person, now)
  if (isOnLeaveDuring(person, startDate, endDate)) return false
  // A mission that is already over no longer ties anybody up.
  const relevant = missions.filter(m => getMissionStatus(m, now) !== MISSION_STATUS.COMPLETED)
  return !isPersonCommitted(person.id, relevant, startDate, endDate, { excludeMissionId })
}

/** Can the vehicle be assigned to a mission over this period? */
export function isVehicleAvailable(vehicle, missions, startDate, endDate, options = {}) {
  const { excludeMissionId = null, now = nowString() } = options
  if (vehicle.status === VEHICLE_STATUS.ON_LOAN) return false
  if (!startDate || !endDate) return true
  const relevant = missions.filter(m => getMissionStatus(m, now) !== MISSION_STATUS.COMPLETED)
  return !isVehicleCommitted(vehicle.id, relevant, startDate, endDate, { excludeMissionId })
}
