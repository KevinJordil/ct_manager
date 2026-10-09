/**
 * Resources that left the application but stay in the missions they took
 * part in.
 *
 * Deleting a vehicle or a person must not rewrite history: a past mission
 * still says which plate went and who drove it. When a record is deleted the
 * server keeps a frozen copy of what identified it inside each mission that
 * names it (`retiredVehicles`, `retiredPersons`); these helpers fall back on
 * that copy when the live record is gone.
 */

/** What identifies a vehicle on paper. */
export function vehicleSnapshot(vehicle) {
  return { plate: vehicle.plate ?? '', name: vehicle.name ?? '', category: vehicle.category ?? '' }
}

/** What identifies a trailer on paper. */
export function trailerSnapshot(trailer) {
  return { plate: trailer.plate ?? '', name: trailer.name ?? '' }
}

/** What identifies a person on paper. */
export function personSnapshot(person) {
  return { rank: person.rank ?? '', firstName: person.firstName ?? '', lastName: person.lastName ?? '' }
}

/** The vehicle a mission names, live or as it was when deleted. */
export function vehicleInMission(mission, vehicleId, vehicles) {
  const live = vehicles.find(vehicle => vehicle.id === vehicleId)
  if (live) return live
  const copy = mission?.retiredVehicles?.[vehicleId]
  return copy ? { id: vehicleId, ...copy, retired: true } : undefined
}

/** The trailer a mission names, live or as it was when deleted. */
export function trailerInMission(mission, trailerId, trailers) {
  if (!trailerId) return undefined
  const live = trailers.find(trailer => trailer.id === trailerId)
  if (live) return live
  const copy = mission?.retiredTrailers?.[trailerId]
  return copy ? { id: trailerId, ...copy, retired: true } : undefined
}

/** The person a mission names, live or as they were when deleted. */
export function personInMission(mission, personId, persons) {
  const live = persons.find(person => person.id === personId)
  if (live) return live
  const copy = mission?.retiredPersons?.[personId]
  return copy ? { id: personId, ...copy, retired: true } : undefined
}
