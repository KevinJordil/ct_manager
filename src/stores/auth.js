import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setSessionToken, hasSessionToken } from '../api.js'
import { clearError } from './sync.js'
import { can } from '../../permissions.js'

const ADMIN = 'admin'

/**
 * The signed-in account.
 *
 * The token is a random server-side session identifier kept in localStorage,
 * never a password. The account itself is re-read from the server on start,
 * since a role may have changed since the last visit.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const checking = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === ADMIN)
  const username = computed(() => user.value?.username ?? '')

  /**
   * Every account may use the fleet; managing a resource is granted one by
   * one. The interface asks this to decide what to offer — the server asks
   * it again to decide what to accept.
   */
  function allowed(permission) {
    return can(user.value, permission)
  }

  async function login(name, password) {
    const { token, user: account } = await api.login(name, password)
    setSessionToken(token)
    user.value = account
    // Signing in answers whatever the previous session was complaining
    // about — typically "session expired", raised by the loads that ran
    // with the stale token still in storage.
    clearError()
  }

  async function logout() {
    await api.logout()
    setSessionToken(null)
    user.value = null
  }

  /** Confirms the stored token is still valid and refreshes the account. */
  async function verify() {
    if (!hasSessionToken()) {
      user.value = null
      return false
    }
    checking.value = true
    try {
      user.value = await api.me()
      clearError()
      return true
    } catch {
      setSessionToken(null)
      user.value = null
      return false
    } finally {
      checking.value = false
    }
  }

  /** The server issues a new token, so the current session survives. */
  async function changePassword(currentPassword, newPassword) {
    const { token } = await api.changePassword(currentPassword, newPassword)
    if (token) setSessionToken(token)
  }

  /** Called when the API answers 401: the session is gone. */
  function clear() {
    setSessionToken(null)
    user.value = null
  }

  return {
    user, isAuthenticated, isAdmin, username, checking,
    can: allowed,
    login, logout, verify, changePassword, clear,
  }
})
