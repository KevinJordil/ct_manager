import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { api } from '../api.js'
import { REQUEST_STATUS } from '../constants.js'
import { reportError, reportAuthRequired, clearError } from './sync.js'

/**
 * Vehicle requests sent from the public form.
 *
 * Unlike the other collections this one is not saved as a whole array: the
 * server owns it, and each action is a targeted call. A public visitor can
 * only submit; reading and deciding require a session.
 */
export const useRequestsStore = defineStore('requests', () => {
  const requests = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  let initPromise = null

  const pendingCount = computed(() =>
    requests.value.filter(r => r.status === REQUEST_STATUS.PENDING).length
  )

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
        requests.value = await api.loadRequests()
      } catch (error) {
        handleError(error, 'requests.loadFailed')
        initPromise = null // a failed load must stay retryable
      } finally {
        loading.value = false
        loaded.value = true
      }
    })()
    return initPromise
  }

  async function reload() {
    initPromise = null
    loaded.value = false
    return init()
  }

  /** Public submission; throws so the form can show the reason inline. */
  async function submit(payload) {
    return api.submitRequest(payload)
  }

  async function setStatus(id, status) {
    const request = requests.value.find(r => r.id === id)
    const previous = request?.status
    if (request) request.status = status // optimistic, reverted on failure
    try {
      await api.setRequestStatus(id, status)
      clearError()
    } catch (error) {
      if (request && previous !== undefined) request.status = previous
      handleError(error, 'requests.updateFailed')
    }
  }

  async function remove(id) {
    const snapshot = requests.value
    requests.value = requests.value.filter(r => r.id !== id)
    try {
      await api.deleteRequest(id)
      clearError()
    } catch (error) {
      requests.value = snapshot
      handleError(error, 'requests.deleteFailed')
    }
  }

  return {
    requests,
    loading: readonly(loading),
    loaded: readonly(loaded),
    pendingCount,
    init, reload, submit, setStatus, remove,
  }
})
