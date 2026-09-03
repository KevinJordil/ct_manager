import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setSessionToken, hasSessionToken } from '../api.js'

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

  async function login(name, password) {
    const { token, user: account } = await api.login(name, password)
    setSessionToken(token)
    user.value = account
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
    login, logout, verify, changePassword, clear,
  }
})
