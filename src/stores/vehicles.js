import { defineStore } from 'pinia'
import { VEHICLE_STATUS } from '../constants.js'
import { newId } from '../id.js'
import { migrateVehicles } from '../migrations.js'
import { useCollection } from './collection.js'

export const useVehiclesStore = defineStore('vehicles', () => {
  const collection = useCollection('vehicles', migrateVehicles)

  function lend(id, { note, until = '' }) {
    collection.mutate(id, vehicle => {
      vehicle.status = VEHICLE_STATUS.ON_LOAN
      vehicle.loanNote = note
      vehicle.loanUntil = until
    })
  }

  function release(id) {
    collection.mutate(id, vehicle => {
      vehicle.status = VEHICLE_STATUS.FREE
      vehicle.loanNote = ''
      vehicle.loanUntil = ''
    })
  }

  function addCheck(vehicleId, check) {
    collection.mutate(vehicleId, vehicle => {
      if (!vehicle.checks) vehicle.checks = []
      vehicle.checks.push({ ...check, id: newId() })
    })
  }

  function removeCheck(vehicleId, checkId) {
    collection.mutate(vehicleId, vehicle => {
      vehicle.checks = (vehicle.checks ?? []).filter(check => check.id !== checkId)
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
    lend, release, addCheck, removeCheck,
  }
})
