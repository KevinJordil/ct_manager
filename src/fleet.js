/**
 * The fleet read by type.
 *
 * Somebody looking for a vehicle rarely wants "a vehicle": they want a heavy
 * one, or a light off-road one, and the first question is how many of that
 * type can be taken right now. This groups the fleet that way and counts what
 * stands in the way of each one.
 */
import { VEHICLE_CATEGORIES, VEHICLE_STATUS } from './constants.js'
import { getVehicleStatus } from './availability.js'
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
