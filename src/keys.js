/**
 * Vehicle keys.
 *
 * A key is held by exactly one person at a time, or by nobody — in which case
 * it hangs on the board and the vehicle can be taken. The holder is usually a
 * declared person, but a key can also be lent to somebody outside the
 * application (a mechanic, another unit), who is recorded by name alone.
 *
 * Anybody signed in may record a movement, whatever their licence: the record
 * says where the key is, it does not grant permission to drive.
 */
import { KEY_ACTION, KEY_HISTORY_LIMIT } from './constants.js'
import { personName } from './labels.js'

/** True when somebody is holding the key. */
export function keyIsOut(vehicle) {
  return Boolean(vehicle?.keyHolder)
}

/** The name to display for a holder, whether declared in the app or not. */
export function holderName(holder, persons = []) {
  if (!holder) return ''
  const person = holder.personId ? persons.find(p => p.id === holder.personId) : null
  return person ? personName(person) : holder.name
}

/** Builds the holder record stored on the vehicle. */
export function makeHolder({ personId = null, name = '', recordedBy = '' }, at) {
  return {
    personId: personId || null,
    name: String(name).trim(),
    since: at,
    recordedBy,
  }
}

/** Appends a movement, keeping only the most recent ones. */
export function pushHistory(vehicle, entry) {
  const history = vehicle.keyHistory ?? []
  history.push(entry)
  vehicle.keyHistory = history.slice(-KEY_HISTORY_LIMIT)
}

/**
 * How to name the account recording a movement. An account tied to a person
 * is shown under that person's name, which is what a reader of the log is
 * looking for; a service account keeps its username.
 */
export function recorderName(user, persons = []) {
  if (!user) return ''
  const person = user.personId ? persons.find(p => p.id === user.personId) : null
  return person ? personName(person) : (user.username ?? '')
}

/** Vehicles whose key is out, most recently taken first. */
export function vehiclesWithKeyOut(vehicles) {
  return vehicles
    .filter(keyIsOut)
    .sort((a, b) => (b.keyHolder.since ?? '').localeCompare(a.keyHolder.since ?? ''))
}

/** Vehicles whose key is on the board. */
export function vehiclesWithKeyIn(vehicles) {
  return vehicles.filter(vehicle => !keyIsOut(vehicle))
}

/**
 * Every key movement of the fleet, most recent first.
 *
 * Each entry carries its vehicle, since the log reads across the fleet: the
 * question it answers is "what happened this morning", not "what happened to
 * this vehicle".
 */
export function keyMovements(vehicles) {
  const all = []
  for (const vehicle of vehicles) {
    for (const entry of vehicle.keyHistory ?? []) {
      all.push({
        ...entry,
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        vehiclePlate: vehicle.plate,
        // Who held the key and who recorded the movement are two different
        // questions: anybody may hand a key over on somebody else's behalf.
        byOther: Boolean(entry.recordedBy) && entry.recordedBy !== entry.name,
      })
    }
  }
  return all.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.vehicleName.localeCompare(b.vehicleName))
}

/** The keys a person is currently holding. */
export function keysHeldBy(personId, vehicles) {
  return vehicles.filter(vehicle => vehicle.keyHolder?.personId === personId)
}

export { KEY_ACTION }
