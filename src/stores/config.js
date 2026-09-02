import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { api } from '../api.js'
import { DEFAULT_CONFIG, withDefaults, isBuiltInRequestType } from '../config.js'
import { reportError, reportAuthRequired, clearError } from './sync.js'

/**
 * Configuration an operator may adjust: the vehicle types offered on the
 * request form, the licence codes, and which licence allows which category.
 *
 * Falls back to the built-in defaults so the interface stays usable even if
 * the server cannot be reached.
 */
export const useConfigStore = defineStore('config', () => {
  const config = ref(withDefaults({}))
  const loading = ref(false)
  const loaded = ref(false)
  let initPromise = null

  const requestVehicleTypes = computed(() => config.value.requestVehicleTypes)
  const licenses = computed(() => config.value.licenses)
  const licensesByCategory = computed(() => config.value.licensesByCategory)
  const trailerLicensesByCategory = computed(() => config.value.trailerLicensesByCategory)

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
        config.value = withDefaults(await api.loadConfig())
      } catch (error) {
        handleError(error, 'config.loadFailed')
        initPromise = null
      } finally {
        loading.value = false
        loaded.value = true
      }
    })()
    return initPromise
  }

  /** @returns {boolean} whether the save succeeded */
  async function save(next) {
    const candidate = withDefaults(next)
    try {
      await api.saveConfig(candidate)
      config.value = candidate
      clearError()
      return true
    } catch (error) {
      handleError(error, 'config.saveFailed')
      return false
    }
  }

  function reset() {
    return save(DEFAULT_CONFIG)
  }

  /**
   * Label of a request vehicle type: a built-in one is translated, a custom
   * one shows the label it was given.
   */
  function requestTypeLabel(type, t) {
    if (type.label) return type.label
    return isBuiltInRequestType(type.id) ? t(`requests.types.${type.id}`) : type.id
  }

  return {
    config: readonly(config),
    loading: readonly(loading),
    loaded: readonly(loaded),
    requestVehicleTypes,
    licenses,
    licensesByCategory,
    trailerLicensesByCategory,
    init, save, reset, requestTypeLabel,
  }
})
