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
 */
export function useCollection(entity, migrate = data => data) {
  const items = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const loadError = ref(null)
  // Version returned by the server on the last successful exchange; guards
  // against overwriting changes made from another tab.
  let version = null
  let initPromise = null

  function handleError(err, context) {
    if (err.status === 401) return reportAuthRequired()
    if (err.status === 409) {
      version = err.params?.version ?? version
      return reportError('errors.conflict', { entity }, { isConflict: true, context })
    }
    // A coded server error is rendered directly; anything else falls back to
    // a generic message carrying the raw reason.
    if (err.code) return reportError(`server.${err.code}`, { ...err.params, entity }, { context })
    reportError(context === 'save' ? 'errors.saveFailed' : 'errors.loadFailed',
      { entity, reason: err.message }, { context })
  }

  async function init() {
    if (initPromise) return initPromise
    loading.value = true
    initPromise = (async () => {
      try {
        const { data, version: loadedVersion } = await api.load(entity)
        items.value = migrate(data)
        version = loadedVersion
        loadError.value = null
      } catch (err) {
        loadError.value = err.message
        handleError(err, 'load')
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
    clearError()
    return init()
  }

  async function persist() {
    // Without a successful load the collection is empty in memory: saving it
    // would replace the server's file with an empty array.
    if (!version) {
      return reportError('errors.notLoaded', { entity }, { context: 'save' })
    }
    startSaving()
    try {
      const { version: newVersion } = await api.save(entity, items.value, version)
      version = newVersion
      clearError()
    } catch (err) {
      handleError(err, 'save')
    } finally {
      endSaving()
    }
  }

  function add(data) {
    const item = { ...data, id: newId() }
    items.value.push(item)
    persist()
    return item
  }

  function update(id, data) {
    const index = items.value.findIndex(i => i.id === id)
    if (index === -1) return
    const { id: _ignored, ...rest } = data
    items.value[index] = { ...items.value[index], ...rest }
    persist()
  }

  function remove(id) {
    items.value = items.value.filter(i => i.id !== id)
    persist()
  }

  /** Mutates one item then saves, if it exists */
  function mutate(id, fn) {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    fn(item)
    persist()
  }

  return {
    items,
    loading: readonly(loading),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
    init, reload, add, update, remove, mutate, persist,
  }
}
