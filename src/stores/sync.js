import { ref, readonly } from 'vue'

/**
 * Synchronisation state with the server, shared by the whole application.
 *
 * Saves happen in the background: without this channel a failure (server
 * down, request rejected, conflict with another tab) would stay invisible
 * and the user would lose work without noticing.
 *
 * Errors are held as a translation key plus parameters so the banner can be
 * rendered in the reader's language.
 */

const error = ref(null)
const conflict = ref(false)
const keyRequired = ref(false)
const saving = ref(0)

/**
 * @param key     translation key
 * @param params  interpolation values
 * @param context 'load' | 'save' — a save failure also warns that the last
 *                changes are not stored
 */
export function reportError(key, params = {}, { isConflict = false, context = null } = {}) {
  error.value = { key, params, context }
  if (isConflict) conflict.value = true
}

export function reportKeyRequired() {
  keyRequired.value = true
  error.value = { key: 'errors.accessKeyRequired', params: {}, context: null }
}

export function clearError() {
  error.value = null
  conflict.value = false
  keyRequired.value = false
}

export function startSaving() { saving.value++ }
export function endSaving() { saving.value = Math.max(0, saving.value - 1) }

export function useSync() {
  return {
    error: readonly(error),
    conflict: readonly(conflict),
    keyRequired: readonly(keyRequired),
    saving: readonly(saving),
    clearError,
  }
}
