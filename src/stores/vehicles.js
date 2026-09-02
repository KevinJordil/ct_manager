import { defineStore } from 'pinia'
import { VEHICLE_STATUS } from '../constants.js'
import { migrateVehicles } from '../migrations.js'
import { useCollection } from './collection.js'

export const useVehiclesStore = defineStore('vehicles', () => {
  const collection = useCollection('vehicles', migrateVehicles)

  function lend(id, note) {
    collection.mutate(id, vehicle => {
      vehicle.status = VEHICLE_STATUS.ON_LOAN
      vehicle.loanNote = note
    })
  }

  function release(id) {
    collection.mutate(id, vehicle => {
      vehicle.status = VEHICLE_STATUS.FREE
      vehicle.loanNote = ''
    })
  }

  return {
    vehicles: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    add: collection.add,
    update: collection.update,
    remove: collection.remove,
    lend, release,
  }
})
