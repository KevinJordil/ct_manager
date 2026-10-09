import { defineStore } from 'pinia'
import { VEHICLE_STATUS } from '../constants.js'
import { migrateTrailers } from '../migrations.js'
import { useCollection } from './collection.js'

/**
 * Trailers, each with its plate and the vehicle models it can be hitched to.
 * Planned on missions like a vehicle, lent out or taken out of service like
 * one — but with no key and no weekly check.
 */
export const useTrailersStore = defineStore('trailers', () => {
  const collection = useCollection('trailers', migrateTrailers)

  /** Lends the trailer out, or takes it out of service (`status`). */
  function lend(id, { note, until = '', status = VEHICLE_STATUS.ON_LOAN }) {
    return collection.mutate(id, trailer => {
      trailer.status = status
      trailer.loanNote = note
      trailer.loanUntil = until
    })
  }

  function release(id) {
    return collection.mutate(id, trailer => {
      trailer.status = VEHICLE_STATUS.FREE
      trailer.loanNote = ''
      trailer.loanUntil = ''
    })
  }

  return {
    trailers: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    refresh: collection.refresh,
    add: collection.add,
    update: collection.update,
    remove: collection.remove,
    lend, release,
  }
})
