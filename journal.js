/** Durable journal, independent of the lifetime of vehicle records. */
import { keyMovements } from './src/keys.js'
import { personSnapshot, vehicleSnapshot, trailerSnapshot } from './src/retired.js'

export function mergeJournal(journal, vehicles) {
  const archived = new Set(journal.archives.flatMap(archive => archive.entries.map(entry => entry.id)))
  const entries = new Map(journal.entries.map(entry => [entry.id, entry]))
  let sequence = journal.sequence ?? journal.entries.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0)
  for (const entry of keyMovements(vehicles).reverse()) {
    if (archived.has(entry.id)) continue
    const previous = entries.get(entry.id)
    // Identity belongs to the movement, even if the vehicle is renamed later.
    entries.set(entry.id, previous ? { ...previous, ...(entry.closedBy ? { closedBy: entry.closedBy } : {}), ...(entry.closes ? { closes: entry.closes } : {}) } : { ...entry, sequence: ++sequence })
  }
  return { ...journal, sequence, entries: [...entries.values()] }
}

export function deletionBlocker(entity, removed, vehicles, missions, now) {
  const ids = new Set(removed.map(item => item.id))
  if (!ids.size) return null
  const keys = entity === 'trailers' ? [] : vehicles.filter(vehicle => entity === 'persons'
    ? ids.has(vehicle.keyHolder?.personId)
    : ids.has(vehicle.id) && vehicle.keyHolder)
  if (keys.length) return { code: 'deletion.keys', params: { vehicles: keys.map(v => v.plate || v.name).join(', ') } }
  const active = missions.filter(mission => !mission.cancelled && (!mission.endDate || mission.endDate >= now) &&
    namedIds(entity, mission).some(id => ids.has(id)))
  if (active.length) return { code: 'deletion.missions', params: { missions: active.map(m => m.title).join(', ') } }
  return null
}

const MEMORY = {
  persons: { key: 'retiredPersons', snapshot: personSnapshot },
  vehicles: { key: 'retiredVehicles', snapshot: vehicleSnapshot },
  trailers: { key: 'retiredTrailers', snapshot: trailerSnapshot },
}

/** The ids of one kind of resource a mission names. */
function namedIds(entity, mission) {
  const entries = mission.vehicles ?? []
  if (entity === 'persons') return [...entries.map(entry => entry.driverId), ...(mission.staffIds ?? [])]
  if (entity === 'trailers') return entries.map(entry => entry.trailerId).filter(Boolean)
  return entries.map(entry => entry.vehicleId)
}

/**
 * Only past/cancelled missions reach this step, after the deletion guard.
 * They keep their references, and a frozen copy of what identified each
 * deleted resource: history still says which plate went and who drove it.
 */
export function rememberResources(entity, removed, missions) {
  const byId = new Map(removed.map(item => [item.id, item]))
  const { key, snapshot } = MEMORY[entity]
  return missions.map(mission => {
    const hits = namedIds(entity, mission).filter(id => byId.has(id))
    if (!hits.length) return mission
    const kept = { ...(mission[key] ?? {}) }
    for (const id of hits) kept[id] = snapshot(byId.get(id))
    return { ...mission, [key]: kept }
  })
}
