import { defineStore } from 'pinia'
import { KEY_ACTION, VEHICLE_STATUS } from '../constants.js'
import { newId } from '../id.js'
import { nowString } from '../datetime.js'
import { makeHolder, openHolding, pushHistory } from '../keys.js'
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

  /**
   * Hands the key to somebody. The same call covers taking a key off the
   * board and passing it on, so the two never disagree about who holds what;
   * the history keeps the distinction.
   */
  function takeKey(vehicleId, { personId = null, name = '', recordedBy = '' } = {}) {
    collection.mutate(vehicleId, vehicle => {
      const at = nowString()
      const previous = vehicle.keyHolder
      const holder = makeHolder({ personId, name, recordedBy }, at)
      // A transfer ends one holding and opens another: the two entries point
      // at each other, so the log can be read from either end.
      const opened = previous ? openHolding(vehicle) : null
      const id = newId()
      if (opened) opened.closedBy = id
      vehicle.keyHolder = holder
      pushHistory(vehicle, {
        id,
        at,
        action: previous ? KEY_ACTION.TRANSFERRED : KEY_ACTION.TAKEN,
        personId: holder.personId,
        name: holder.name,
        from: previous ? previous.name : '',
        closes: opened ? opened.id : '',
        recordedBy,
      })
    })
  }

  /** Puts the key back on the board. */
  function returnKey(vehicleId, { recordedBy = '' } = {}) {
    collection.mutate(vehicleId, vehicle => {
      const previous = vehicle.keyHolder
      if (!previous) return
      const opened = openHolding(vehicle)
      const id = newId()
      if (opened) opened.closedBy = id
      vehicle.keyHolder = null
      pushHistory(vehicle, {
        id,
        at: nowString(),
        action: KEY_ACTION.RETURNED,
        personId: previous.personId,
        name: previous.name,
        from: '',
        closes: opened ? opened.id : '',
        recordedBy,
      })
    })
  }

  /** Called when a person leaves the application: their name stays readable. */
  function forgetPersonKeys(personId) {
    for (const vehicle of collection.items.value) {
      if (vehicle.keyHolder?.personId !== personId) continue
      collection.mutate(vehicle.id, v => { v.keyHolder = { ...v.keyHolder, personId: null } })
    }
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
    takeKey, returnKey, forgetPersonKeys,
  }
})
