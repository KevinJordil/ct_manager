import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { newId } from '../id.js'
import {
  reportError, reportAuthRequired, clearError, startSaving, endSaving,
} from './sync.js'

/**
 * Shared skeleton for the persisted collections (persons, vehicles,
 * missions): single load, migration of historic shapes, CRUD and saving.
 *
 * @param entity  collection name on the API side
 * @param migrate transformation applied to the loaded data
 * @param replay  replay a change on fresh data after a conflict; off where
 *                the other writer's change may invalidate this one (two
 *                missions booking the same vehicle must be looked at again)
 */
export function useCollection(entity, migrate = data => data, { replay = true } = {}) {
  const items = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const loadError = ref(null)
  // Version returned by the server on the last successful exchange; guards
  // against overwriting changes made from another tab.
  let version = null
  let initPromise = null

  function isVersionConflict(err) {
    return err.status === 409 && (!err.code || err.code === 'conflict')
  }

  function handleError(err, context) {
    if (err.status === 401) return reportAuthRequired()
    // The data shown has already been refreshed from the server (see
    // commit): the version is never adopted without the data that goes with
    // it, or the next save would overwrite the other writer's work.
    if (isVersionConflict(err)) {
      return reportError('errors.conflict', { entity }, { isConflict: true, context, source: entity })
    }
    // A coded server error is rendered directly; anything else falls back to
    // a generic message carrying the raw reason.
    if (err.code) return reportError(`server.${err.code}`, { ...err.params, entity }, { context, source: entity })
    reportError(context === 'save' ? 'errors.saveFailed' : 'errors.loadFailed',
      { entity, reason: err.message }, { context, source: entity })
  }

  async function fetchCurrent() {
    const { data, version: loadedVersion } = await api.load(entity)
    items.value = migrate(data)
    version = loadedVersion
  }

  async function init() {
    if (initPromise) return initPromise
    loading.value = true
    initPromise = (async () => {
      try {
        await fetchCurrent()
        loadError.value = null
      } catch (err) {
        loadError.value = err.message
        handleError(err, 'load')
        // A failed load must not be memoised: the next attempt — after a
        // login, or once the server is back — has to hit the network again.
        initPromise = null
      } finally {
        loading.value = false
        loaded.value = true
      }
    })()
    return initPromise
  }

  /** Starts a fresh load, forgetting the previous one (a "retry" button) */
  async function reload() {
    initPromise = null
    loaded.value = false
    clearError(entity)
    return init()
  }

  // Changes are saved one after the other: each one starts from the version
  // the previous one left, instead of racing it into a conflict.
  let queue = Promise.resolve()
  let pending = 0

  /**
   * Applies a change and saves the collection.
   *
   * `apply` changes `items` and returns false when its target is gone. If
   * somebody else saved in between, the data is read again and the change
   * replayed once on top of it: two key movements at the counter both land,
   * rather than the second one writing over the first. Whatever fails, the
   * change is undone, so the screen never shows what the server refused.
   *
   * @returns {Promise<boolean>} true once the server has stored the change
   */
  function commit(apply) {
    // With nothing in flight the change shows at once; otherwise it waits
    // its turn.
    const run = pending === 0 ? commitNow(apply) : queue.then(() => commitNow(apply))
    pending++
    queue = run.catch(() => {}).finally(() => { pending-- })
    return run
  }

  async function commitNow(apply) {
    // Without a successful load the collection is empty in memory: saving it
    // would replace the server's file with an empty array.
    if (!version) {
      reportError('errors.notLoaded', { entity }, { context: 'save', source: entity })
      return false
    }
    startSaving()
    try {
      for (let attempt = 0; ; attempt++) {
        const before = JSON.parse(JSON.stringify(items.value))
        if (apply() === false) {
          if (attempt > 0) reportError('errors.conflict', { entity }, { isConflict: true, context: 'save', source: entity })
          return false
        }
        try {
          const { version: newVersion } = await api.save(entity, items.value, version)
          version = newVersion
          clearError(entity)
          return true
        } catch (err) {
          items.value = before
          if (isVersionConflict(err)) {
            try {
              await fetchCurrent()
            } catch (loadErr) {
              handleError(loadErr, 'load')
              return false
            }
            if (attempt === 0 && replay) continue
          }
          handleError(err, 'save')
          return false
        }
      }
    } finally {
      endSaving()
    }
  }

  /** Saves the collection as it stands. */
  function persist() {
    return commit(() => true)
  }

  /** @returns {Promise<object|null>} the stored item, or null if refused */
  async function add(data) {
    const item = { ...data, id: newId() }
    const saved = await commit(() => { items.value.push({ ...item }) })
    return saved ? items.value.find(i => i.id === item.id) : null
  }

  function update(id, data) {
    const { id: _ignored, ...rest } = data
    return commit(() => {
      const index = items.value.findIndex(i => i.id === id)
      if (index === -1) return false
      items.value[index] = { ...items.value[index], ...rest }
    })
  }

  function remove(id) {
    return commit(() => {
      if (!items.value.some(i => i.id === id)) return false
      items.value = items.value.filter(i => i.id !== id)
    })
  }

  /** Mutates one item then saves, if it exists */
  function mutate(id, fn) {
    return commit(() => {
      const item = items.value.find(i => i.id === id)
      if (!item) return false
      fn(item)
    })
  }

  return {
    items,
    loading: readonly(loading),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
    init, reload, add, update, remove, mutate, persist,
  }
}
