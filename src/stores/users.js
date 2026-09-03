import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { reportError, reportAuthRequired, clearError } from './sync.js'

/**
 * Accounts, readable and writable by administrators only.
 *
 * Every call is targeted rather than a whole-array save: the server owns the
 * password digests, which never travel back to the browser.
 */
export const useUsersStore = defineStore('users', () => {
  const users = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  let initPromise = null

  function handleError(error, key) {
    if (error.status === 401) return reportAuthRequired()
    if (error.code) return reportError(`server.${error.code}`, error.params ?? {})
    reportError(key, { reason: error.message })
  }

  async function init() {
    if (initPromise) return initPromise
    loading.value = true
    initPromise = (async () => {
      try {
        users.value = await api.loadUsers()
      } catch (error) {
        handleError(error, 'users.loadFailed')
        initPromise = null
      } finally {
        loading.value = false
        loaded.value = true
      }
    })()
    return initPromise
  }

  /** Throws, so the form can show the reason next to the offending field. */
  async function create(payload) {
    const user = await api.createUser(payload)
    users.value.push(user)
    clearError()
    return user
  }

  async function update(id, payload) {
    const user = await api.updateUser(id, payload)
    const index = users.value.findIndex(candidate => candidate.id === id)
    if (index !== -1) users.value[index] = user
    clearError()
    return user
  }

  async function remove(id) {
    try {
      await api.deleteUser(id)
      users.value = users.value.filter(user => user.id !== id)
      clearError()
    } catch (error) {
      handleError(error, 'users.saveFailed')
    }
  }

  return {
    users,
    loading: readonly(loading),
    loaded: readonly(loaded),
    init, create, update, remove,
  }
})
