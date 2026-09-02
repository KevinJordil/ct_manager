import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setSessionToken, hasSessionToken } from '../api.js'

/**
 * Session state.
 *
 * The token lives in localStorage so a reload does not log the user out; it
 * is a random server-side session identifier, never the password.
 */
export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(hasSessionToken())
  const checking = ref(false)

  const isAuthenticated = computed(() => authenticated.value)

  async function login(password) {
    const { token } = await api.login(password)
    setSessionToken(token)
    authenticated.value = true
  }

  async function logout() {
    await api.logout()
    setSessionToken(null)
    authenticated.value = false
  }

  /**
   * Confirms with the server that the stored token is still valid — it may
   * have expired or been revoked since the last visit.
   */
  async function verify() {
    if (!hasSessionToken()) {
      authenticated.value = false
      return false
    }
    checking.value = true
    try {
      const valid = await api.check()
      if (!valid) setSessionToken(null)
      authenticated.value = valid
      return valid
    } finally {
      checking.value = false
    }
  }

  /** Called when the API answers 401: the session is gone. */
  function clear() {
    setSessionToken(null)
    authenticated.value = false
  }

  return { isAuthenticated, checking, login, logout, verify, clear }
})
