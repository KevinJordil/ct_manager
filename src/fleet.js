/**
 * The fleet read by type.
 *
 * Somebody looking for a vehicle rarely wants "a vehicle": they want a heavy
 * one, or a light off-road one, and the first question is how many of that
 * type can be taken right now. This groups the fleet that way and counts what
 * stands in the way of each one.
 */
import {
  CATEGORY_BY_REQUEST_TYPE, SEATS_BY_REQUEST_TYPE, VEHICLE_CATEGORIES, VEHICLE_STATUS,
} from './constants.js'
import { getVehicleStatus, isVehicleAvailable } from './availability.js'
import { keyIsOut } from './keys.js'

/** Why a vehicle cannot be taken, or null when it can. */
export function unavailableReason(vehicle, missions, now) {
  const status = getVehicleStatus(vehicle, missions, now)
  if (status === VEHICLE_STATUS.ON_MISSION) return VEHICLE_STATUS.ON_MISSION
  if (status === VEHICLE_STATUS.ON_LOAN) return VEHICLE_STATUS.ON_LOAN
  // Nothing is planned for it, but its key is in somebody's pocket.
  if (keyIsOut(vehicle)) return 'key-out'
  return null
}

/**
 * One entry per type present in the fleet, in the canonical order, each with
 * its vehicles and its tally.
 *
 * A type nobody owns is left out: an empty heading answers no question.
 */
export function fleetByCategory(vehicles, missions, now) {
  const groups = new Map()

  for (const vehicle of vehicles) {
    const category = vehicle.category ?? 'other'
    if (!groups.has(category)) {
      groups.set(category, {
        category,
        vehicles: [],
        total: 0,
        available: 0,
        onMission: 0,
        onLoan: 0,
        keyOut: 0,
      })
    }
    const group = groups.get(category)
    group.vehicles.push(vehicle)
    group.total++

    switch (unavailableReason(vehicle, missions, now)) {
      case VEHICLE_STATUS.ON_MISSION: group.onMission++; break
      case VEHICLE_STATUS.ON_LOAN: group.onLoan++; break
      case 'key-out': group.keyOut++; break
      default: group.available++
    }
  }

  const order = [...VEHICLE_CATEGORIES, 'other']
  return [...groups.values()].sort((a, b) => {
    const rank = order.indexOf(a.category) - order.indexOf(b.category)
    return rank !== 0 ? rank : a.category.localeCompare(b.category)
  })
}

/**
 * Picks actual vehicles for what a request asked for.
 *
 * The requester writes "a truck for people"; the fleet holds plates. Each
 * requested line is matched to a vehicle of the serving category that is
 * free over the whole period and not already taken by an earlier line. A
 * line that finds nothing keeps an empty slot and says so — proposing a
 * vehicle that is busy would be worse than proposing none.
 *
 * @returns {Array<{type: string, driverRequired: boolean, vehicleId: string,
 *                  category: string, unavailable: boolean}>}
 */
export function suggestVehiclesForRequest(requested, { vehicles, missions, startDate, endDate }) {
  const taken = new Set()

  return (requested ?? []).map(line => {
    const category = CATEGORY_BY_REQUEST_TYPE[line.type] ?? ''
    const seats = SEATS_BY_REQUEST_TYPE[line.type] ?? 0

    const match = vehicles.find(vehicle => {
      if (taken.has(vehicle.id)) return false
      if (category && vehicle.category !== category) return false
      if (seats && (vehicle.seats ?? 0) < seats) return false
      return isVehicleAvailable(vehicle, missions, startDate, endDate)
    })

    if (match) taken.add(match.id)
    return {
      type: line.type,
      driverRequired: Boolean(line.driverRequired),
      vehicleId: match?.id ?? '',
      category,
      // Nothing of that kind is free over the period; the row waits for a
      // decision rather than pretending.
      unavailable: !match,
    }
  })
}
