import { defineStore } from 'pinia'
import { migrateMissions } from '../migrations.js'
import { useCollection } from './collection.js'

/** The status is always recomputed from the dates, so it is never persisted. */
function withoutStatus(mission) {
  const { status: _dropped, ...data } = mission
  return data
}

export const useMissionsStore = defineStore('missions', () => {
  const collection = useCollection('missions', migrateMissions)

  /** Missions still referring to a person, as a driver or as unmounted staff */
  function missionsWithPerson(personId) {
    return collection.items.value.filter(mission =>
      mission.vehicles?.some(entry => entry.driverId === personId) ||
      mission.staffIds?.includes(personId))
  }

  function missionsWithVehicle(vehicleId) {
    return collection.items.value.filter(mission =>
      mission.vehicles?.some(entry => entry.vehicleId === vehicleId))
  }

  /**
   * Drops every reference to a deleted person. Without this the mission keeps
   * a dead identifier and silently displays an empty driver.
   */
  function forgetPerson(personId) {
    let changed = false
    collection.items.value = collection.items.value.map(mission => {
      const vehicles = (mission.vehicles ?? []).map(entry =>
        entry.driverId === personId ? { ...entry, driverId: null } : entry)
      const staffIds = (mission.staffIds ?? []).filter(id => id !== personId)
      if (vehicles.some((entry, i) => entry !== mission.vehicles[i]) ||
          staffIds.length !== (mission.staffIds ?? []).length) {
        changed = true
        return { ...mission, vehicles, staffIds }
      }
      return mission
    })
    if (changed) collection.persist()
  }

  /** Drops every reference to a deleted vehicle, entry included. */
  function forgetVehicle(vehicleId) {
    let changed = false
    collection.items.value = collection.items.value.map(mission => {
      const vehicles = (mission.vehicles ?? []).filter(entry => entry.vehicleId !== vehicleId)
      if (vehicles.length !== (mission.vehicles ?? []).length) {
        changed = true
        return { ...mission, vehicles }
      }
      return mission
    })
    if (changed) collection.persist()
  }

  return {
    missions: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    add: mission => collection.add(withoutStatus(mission)),
    update: (id, data) => collection.update(id, withoutStatus(data)),
    remove: collection.remove,
    missionsWithPerson, missionsWithVehicle, forgetPerson, forgetVehicle,
  }
})
