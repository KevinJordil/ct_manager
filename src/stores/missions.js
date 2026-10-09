import { defineStore } from 'pinia'
import { migrateMissions } from '../migrations.js'
import { useCollection } from './collection.js'
import { overlaps } from '../datetime.js'

/** The status is always recomputed from the dates, so it is never persisted. */
function withoutStatus(mission) {
  const { status: _dropped, ...data } = mission
  return data
}

export const useMissionsStore = defineStore('missions', () => {
  // Two people planning different missions do not get in each other's way.
  // A mission saved while another one on overlapping dates changed is not
  // replayed, though: that change may have taken the same vehicle or driver.
  const collection = useCollection('missions', migrateMissions, {
    replayIf: ({ attempted, changed }) => !attempted || !changed.some(other =>
      overlaps(other.startDate, other.endDate, attempted.startDate, attempted.endDate)),
  })

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

  return {
    missions: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    refresh: collection.refresh,
    add: mission => collection.add(withoutStatus(mission)),
    update: (id, data) => collection.update(id, withoutStatus(data)),
    remove: collection.remove,
    missionsWithPerson, missionsWithVehicle,
  }
})
