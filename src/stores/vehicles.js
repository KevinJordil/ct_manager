import { defineStore } from 'pinia'
import { VEHICLE_STATUS } from '../constants.js'
import { api } from '../api.js'
import { migrateVehicles } from '../migrations.js'
import { useCollection } from './collection.js'

export const useVehiclesStore = defineStore('vehicles', () => {
  const collection = useCollection('vehicles', migrateVehicles)

  /** Lends the vehicle out, or takes it out of service (`status`). */
  function lend(id, { note, until = '', status = VEHICLE_STATUS.ON_LOAN }) {
    return collection.mutate(id, vehicle => {
      vehicle.status = status
      vehicle.loanNote = note
      vehicle.loanUntil = until
    })
  }

  function release(id) {
    return collection.mutate(id, vehicle => {
      vehicle.status = VEHICLE_STATUS.FREE
      vehicle.loanNote = ''
      vehicle.loanUntil = ''
    })
  }

  /**
   * Counter actions — a key, a weekly check — go to the server for the one
   * vehicle concerned; it applies them to the stored record, says who did
   * them and when, and sends the vehicle back.
   */
  const fromServer = call => collection.viaServer(async () => {
    const { vehicle, version, previous } = await call()
    return { item: vehicle, version, previous }
  })

  /**
   * Hands the key to somebody. The same call covers taking a key off the
   * board and passing it on; the history keeps the distinction.
   */
  function takeKey(vehicleId, { personId = null, name = '' } = {}) {
    return fromServer(() => api.moveKey(vehicleId, { personId, name }, shownHolder(vehicleId)))
  }

  /** Puts the key back on the board. */
  function returnKey(vehicleId) {
    return fromServer(() => api.moveKey(vehicleId, null, shownHolder(vehicleId)))
  }

  /** Who the screen shows holding the key: the server checks it still is. */
  function shownHolder(vehicleId) {
    const holder = collection.items.value.find(vehicle => vehicle.id === vehicleId)?.keyHolder
    return holder ? { personId: holder.personId ?? null, name: holder.name } : null
  }

  function addCheck(vehicleId, { date, personId = null, note = '' }) {
    return fromServer(() => api.addCheck(vehicleId, { date, personId, note }))
  }

  function removeCheck(vehicleId, checkId) {
    return fromServer(() => api.removeCheck(vehicleId, checkId))
  }

  return {
    vehicles: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    refresh: collection.refresh,
    add: collection.add,
    update: collection.update,
    remove: collection.remove,
    lend, release, addCheck, removeCheck,
    takeKey, returnKey,
  }
})
