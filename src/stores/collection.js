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
 * @param replayIf extra condition for replaying a change after somebody
 *                 else saved: receives the record as it was to be saved and
 *                 the records the other writer changed
 */
export function useCollection(entity, migrate = data => data, { replayIf = null } = {}) {
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

  function enqueue(task) {
    // With nothing in flight the change shows at once; otherwise it waits
    // its turn.
    const run = pending === 0 ? task() : queue.then(task)
    pending++
    queue = run.catch(() => {}).finally(() => { pending-- })
    return run
  }

  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  /**
   * After somebody else saved, may this change be replayed on their data?
   * Only when they left its record alone — otherwise it is a real conflict,
   * and the person has to look again — and when the collection's own rule
   * agrees (a mission also asks that nothing near it in time moved).
   */
  function mayReplay({ id, base, fresh, attempted }) {
    if (id == null) return true
    if (!same(base.find(i => i.id === id), fresh.find(i => i.id === id))) return false
    if (!replayIf) return true
    const changed = fresh.filter(item => item.id !== id && !same(item, base.find(i => i.id === item.id)))
      .concat(base.filter(item => item.id !== id && !fresh.some(i => i.id === item.id)))
    return replayIf({ attempted, changed })
  }

  /**
   * Applies a change and saves the collection.
   *
   * `apply` changes `items` and returns false when its target is gone; `id`
   * names the record it changes. If somebody else saved in between, the data
   * is read again; the change is replayed once on top of it when that is
   * safe (see mayReplay), and reported as a conflict otherwise. Whatever
   * fails, the change is undone, so the screen never shows what the server
   * refused.
   *
   * @returns {Promise<boolean>} true once the server has stored the change
   */
  function commit(apply, id = null) {
    return enqueue(() => commitNow(apply, id))
  }

  async function commitNow(apply, id) {
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
        const attempted = id == null ? null : JSON.parse(JSON.stringify(items.value.find(i => i.id === id) ?? null))
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
            if (attempt === 0 && mayReplay({ id, base: before, fresh: items.value, attempted })) continue
          }
          handleError(err, 'save')
          return false
        }
      }
    } finally {
      endSaving()
    }
  }

  /**
   * Runs an action the server applies to one record itself — a key
   * movement, a weekly check — and takes back the record it returns. No
   * version travels with it, so nobody else's save can make it fail. Our
   * copy keeps its version only if it was current just before.
   *
   * @param call resolves to {item, version, previous}
   * @returns {Promise<boolean>}
   */
  function viaServer(call) {
    return enqueue(async () => {
      startSaving()
      try {
        const { item, version: next, previous } = await call()
        const [fresh] = migrate([item])
        const index = items.value.findIndex(i => i.id === fresh.id)
        if (index === -1) items.value.push(fresh)
        else items.value[index] = fresh
        if (version === previous) version = next
        clearError(entity)
        return true
      } catch (err) {
        // Refused because the record moved meanwhile: show what it is now.
        if (err.status === 409 || err.status === 404) await fetchCurrent().catch(() => {})
        handleError(err, 'save')
        return false
      } finally {
        endSaving()
      }
    })
  }

  /**
   * Reads the server's data again when nothing is being saved: the counter
   * at the other end of the room may have moved a key since this screen
   * loaded. Skipped while a change is in flight, and silent on failure.
   */
  async function refresh() {
    if (!version || pending > 0) return
    try {
      const { data, version: loadedVersion } = await api.load(entity)
      if (pending > 0 || loadedVersion === version) return
      items.value = migrate(data)
      version = loadedVersion
    } catch { /* the next refresh, or the next save, will tell */ }
  }

  /** Saves the collection as it stands. */
  function persist() {
    return commit(() => true)
  }

  /** @returns {Promise<object|null>} the stored item, or null if refused */
  async function add(data) {
    const item = { ...data, id: newId() }
    const saved = await commit(() => { items.value.push({ ...item }) }, item.id)
    return saved ? items.value.find(i => i.id === item.id) : null
  }

  function update(id, data) {
    const { id: _ignored, ...rest } = data
    return commit(() => {
      const index = items.value.findIndex(i => i.id === id)
      if (index === -1) return false
      items.value[index] = { ...items.value[index], ...rest }
    }, id)
  }

  function remove(id) {
    return commit(() => {
      if (!items.value.some(i => i.id === id)) return false
      items.value = items.value.filter(i => i.id !== id)
    }, id)
  }

  /** Mutates one item then saves, if it exists */
  function mutate(id, fn) {
    return commit(() => {
      const item = items.value.find(i => i.id === id)
      if (!item) return false
      fn(item)
    }, id)
  }

  return {
    items,
    loading: readonly(loading),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
    init, reload, refresh, add, update, remove, mutate, persist, viaServer,
  }
}
