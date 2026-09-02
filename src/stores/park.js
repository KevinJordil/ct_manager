import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { newId } from '../id.js'
import { reportError, reportAuthRequired, clearError } from './sync.js'

const DEFAULT_COLOR = '#6366f1'

/**
 * Site plan of the vehicle park, with the zones drawn over it.
 *
 * Zones are stored as fractions of the image (0–1) rather than pixels, so the
 * layout survives a change of plan resolution or of display size.
 */
export const useParkStore = defineStore('park', () => {
  const zones = ref([])
  const colorLabels = ref({})
  const imageUrl = ref(null)
  const loading = ref(false)
  const loaded = ref(false)
  let initPromise = null

  function handleError(error, key) {
    if (error.status === 401) return reportAuthRequired()
    if (error.code) return reportError(`server.${error.code}`, error.params ?? {})
    reportError(key, { reason: error.message })
  }

  /** Replaces the object URL, releasing the previous one. */
  function setImageBlob(blob) {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = blob ? URL.createObjectURL(blob) : null
  }

  async function init() {
    if (initPromise) return initPromise
    loading.value = true
    initPromise = (async () => {
      try {
        const layout = await api.loadParkLayout()
        zones.value = layout.zones ?? []
        colorLabels.value = layout.colorLabels ?? {}
        setImageBlob(layout.hasImage ? await api.loadParkImage() : null)
      } catch (error) {
        handleError(error, 'park.loadFailed')
        initPromise = null
      } finally {
        loading.value = false
        loaded.value = true
      }
    })()
    return initPromise
  }

  async function save() {
    try {
      await api.saveParkLayout({
        hasImage: Boolean(imageUrl.value),
        zones: zones.value,
        colorLabels: colorLabels.value,
      })
      clearError()
    } catch (error) {
      handleError(error, 'park.saveFailed')
    }
  }

  /** @param dataUrl a JPEG/PNG/WebP data URL produced by the browser */
  async function setImage(dataUrl) {
    await api.saveParkImage(dataUrl) // throws: the form reports it inline
    setImageBlob(await api.loadParkImage())
    await save()
  }

  async function clearImage() {
    try {
      await api.deleteParkImage()
    } catch (error) {
      handleError(error, 'park.saveFailed')
      return
    }
    setImageBlob(null)
    // Zones drawn over a plan that no longer exists would be meaningless.
    zones.value = []
    await save()
  }

  function addZone(zone) {
    const id = newId()
    zones.value.push({ angle: 0, color: DEFAULT_COLOR, ...zone, id })
    save()
    return id
  }

  /** Mutates without saving: drag and resize call this on every mouse move. */
  function updateZone(id, changes) {
    const index = zones.value.findIndex(zone => zone.id === id)
    if (index !== -1) zones.value[index] = { ...zones.value[index], ...changes }
  }

  function removeZone(id) {
    zones.value = zones.value.filter(zone => zone.id !== id)
    save()
  }

  function setColorLabel(color, label) {
    colorLabels.value = { ...colorLabels.value, [color]: label.trim() }
    save()
  }

  return {
    zones,
    colorLabels,
    imageUrl: readonly(imageUrl),
    loading: readonly(loading),
    loaded: readonly(loaded),
    init, save, setImage, clearImage, addZone, updateZone, removeZone, setColorLabel,
  }
})
