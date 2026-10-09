import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { newId } from '../id.js'
import {
  reportError, reportAuthRequired, clearError, startSaving, endSaving,
} from './sync.js'

/**
 * Shared skeleton for the persisted collections (persons, vehicles,
 * missions, trailers): single load, migration of historic shapes, and
 * changes saved one record at a time.
 *
 * Each change travels alone — this record created, this one changed, this
 * one deleted — so somebody else's work on another record never gets in the
 * way. A change is only refused when the same record was changed meanwhile:
 * a real clash, which the person has to look at again.
 *
 * @param entity  collection name on the API side
 * @param migrate transformation applied to the loaded data
 */
export function useCollection(entity, migrate = data => data) {
  const items = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const loadError = ref(null)
  // Version of the collection last read; only tells a refresh whether
  // anything changed. Saves do not depend on it.
  let version = null
  let initPromise = null

  function handleError(err, context) {
    if (err.status === 401) return reportAuthRequired()
    // Same record changed elsewhere: the screen has been refreshed already.
    if (err.status === 409 && err.code === 'conflict') {
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

  // Changes are sent one after the other, so each starts from the record the
  // previous one left.
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

  const clone = value => JSON.parse(JSON.stringify(value))

  /** Puts the record the server answered in place of ours. */
  function takeBack(item, answer) {
    const [fresh] = migrate([item])
    const index = items.value.findIndex(i => i.id === fresh.id)
    if (index === -1) items.value.push(fresh)
    else items.value[index] = fresh
    if (version === answer.previous) version = answer.version
    return fresh
  }

  /**
   * Shows a change at once, sends it, and undoes it if the server refuses.
   * A refusal because the record changed or vanished elsewhere also brings
   * the screen up to date, so the person sees what they are now facing.
   */
  function send({ show, undo, call, settle }) {
    return enqueue(async () => {
      // Without a successful load nothing on screen reflects the server.
      if (!version) {
        reportError('errors.notLoaded', { entity }, { context: 'save', source: entity })
        return null
      }
      show()
      startSaving()
      try {
        const answer = await call()
        const result = settle(answer)
        clearError(entity)
        return result
      } catch (err) {
        undo()
        if (err.status === 409 || err.status === 404) await fetchCurrent().catch(() => {})
        handleError(err, 'save')
        return null
      } finally {
        endSaving()
      }
    })
  }

  /** @returns {Promise<object|null>} the stored item, or null if refused */
  function add(data) {
    const item = { ...data, id: newId() }
    return send({
      show: () => { items.value.push(clone(item)) },
      undo: () => { items.value = items.value.filter(i => i.id !== item.id) },
      call: () => api.createItem(entity, item),
      settle: answer => takeBack(answer.item, answer),
    })
  }

  /**
   * Changes one record: `change` receives a copy to modify. What we saw
   * before the change goes along, and the server refuses if the record has
   * changed since.
   *
   * @returns {Promise<boolean>}
   */
  async function change(id, changeCopy) {
    const index = items.value.findIndex(i => i.id === id)
    if (index === -1) return false
    let original
    const saved = await send({
      show: () => {
        const at = items.value.findIndex(i => i.id === id)
        original = clone(items.value[at])
        const next = clone(original)
        changeCopy(next)
        items.value[at] = next
      },
      undo: () => {
        const at = items.value.findIndex(i => i.id === id)
        if (at !== -1) items.value[at] = original
      },
      call: () => api.updateItem(entity, id, items.value.find(i => i.id === id), original),
      settle: answer => takeBack(answer.item, answer),
    })
    return Boolean(saved)
  }

  function update(id, data) {
    const { id: _ignored, ...rest } = data
    return change(id, copy => Object.assign(copy, rest))
  }

  /** Mutates one item then saves, if it exists */
  function mutate(id, fn) {
    return change(id, fn)
  }

  async function remove(id) {
    if (!items.value.some(i => i.id === id)) return false
    let before
    const removed = await send({
      show: () => {
        before = items.value
        items.value = items.value.filter(i => i.id !== id)
      },
      undo: () => { items.value = before },
      call: () => api.deleteItem(entity, id),
      settle: answer => {
        if (version === answer.previous) version = answer.version
        return true
      },
    })
    return Boolean(removed)
  }

  /**
   * Runs an action the server applies to one record itself — a key
   * movement, a weekly check — and takes back the record it returns.
   *
   * @param call resolves to {item, version, previous}
   * @returns {Promise<boolean>}
   */
  async function viaServer(call) {
    const done = await send({
      show: () => {},
      undo: () => {},
      call,
      settle: answer => takeBack(answer.item, answer),
    })
    return Boolean(done)
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

  return {
    items,
    loading: readonly(loading),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
    init, reload, refresh, add, update, remove, mutate, viaServer,
  }
}
