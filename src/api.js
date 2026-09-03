const BASE = '/api'
const STORAGE_KEY = 'ct_manager_session'

/**
 * API failure. `code` and `params` come from the server and are rendered in
 * the reader's language by the interface; `message` is the English fallback.
 */
export class ApiError extends Error {
  constructor(message, { status = null, code = null, params = {}, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.params = params
    this.cause = cause
  }
}

// ── Session token ──
// Obtained by logging in; unrelated to the password, and revocable server-side.

function readStoredToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return '' // private browsing, storage blocked…
  }
}

let sessionToken = readStoredToken()

export function setSessionToken(value) {
  sessionToken = value ?? ''
  try {
    if (sessionToken) localStorage.setItem(STORAGE_KEY, sessionToken)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage may be unavailable: the session lasts for this tab */ }
}

export function hasSessionToken() {
  return Boolean(sessionToken)
}

// ── Requests ──

async function readError(res) {
  try {
    const body = await res.json()
    if (body?.code) {
      return { message: body.error ?? body.code, code: body.code, params: body.params ?? {} }
    }
    if (body?.error) return { message: body.error, code: null, params: {} }
  } catch { /* not a JSON response */ }
  return { message: `HTTP ${res.status}`, code: null, params: {} }
}

async function request(url, options = {}) {
  const headers = { ...options.headers }
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (err) {
    throw new ApiError('Server unreachable', { code: 'unreachable', cause: err })
  }
  if (!res.ok) {
    const { message, code, params } = await readError(res)
    throw new ApiError(message, { status: res.status, code, params })
  }
  return res
}

/** Collection version as returned by the server */
function versionOf(res) {
  return (res.headers.get('ETag') ?? '').replace(/"/g, '')
}

export const api = {
  /**
   * Exchanges credentials for a session token.
   * @returns {{ token: string, expiresAt: number, user: object }}
   */
  async login(username, password) {
    const res = await request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    return res.json()
  },

  /** The signed-in account, or throws when the token is dead. */
  async me() {
    return (await request(`${BASE}/auth/me`)).json()
  },

  /** Changing the password ends every other session and returns a fresh token. */
  async changePassword(currentPassword, newPassword) {
    const res = await request(`${BASE}/auth/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    return res.json()
  },

  // ── Person accounts ──
  // A person signs in with their family name; setting the password is part of
  // managing the person, so it needs no administrator.

  async loadPersonAccounts() {
    return (await request(`${BASE}/persons/accounts`)).json()
  },

  async setPersonPassword(personId, lastName, password) {
    const res = await request(`${BASE}/persons/${encodeURIComponent(personId)}/account`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, lastName }),
    })
    return res.json()
  },

  async deletePersonAccount(personId) {
    await request(`${BASE}/persons/${encodeURIComponent(personId)}/account`, { method: 'DELETE' })
  },

  // ── Accounts, administrators only ──

  async loadUsers() {
    return (await request(`${BASE}/users`)).json()
  },

  async createUser(payload) {
    const res = await request(`${BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  },

  async updateUser(id, payload) {
    const res = await request(`${BASE}/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  },

  async deleteUser(id) {
    await request(`${BASE}/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  /** Revokes the session server-side; ignores a failure, the client leaves anyway */
  async logout() {
    try {
      await request(`${BASE}/auth/logout`, { method: 'POST' })
    } catch { /* the local token is dropped regardless */ }
  },

  /** Is the stored token still accepted? */
  async check() {
    try {
      await request(`${BASE}/auth/check`)
      return true
    } catch {
      return false
    }
  },

  // ── Configuration ──
  // Readable without a session, since the public request form needs it.

  async loadConfig() {
    return (await request(`${BASE}/config`)).json()
  },

  async saveConfig(config) {
    await request(`${BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
  },

  // ── Vehicle park ──

  async loadParkLayout() {
    return (await request(`${BASE}/parc`)).json()
  },

  async saveParkLayout(layout) {
    await request(`${BASE}/parc`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
  },

  /**
   * The plan sits behind the session, so it is fetched here rather than by an
   * <img src>: only this path can attach the Authorization header.
   * @returns {Blob|null} null when no plan has been uploaded
   */
  async loadParkImage() {
    try {
      const res = await request(`${BASE}/parc/image`)
      return await res.blob()
    } catch (error) {
      if (error.status === 404) return null
      throw error
    }
  },

  async saveParkImage(dataUrl) {
    await request(`${BASE}/parc/image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    })
  },

  async deleteParkImage() {
    await request(`${BASE}/parc/image`, { method: 'DELETE' })
  },

  // ── Vehicle requests ──
  // Submission is public; everything else needs a session.

  async submitRequest(payload) {
    const res = await request(`${BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  },

  async loadRequests() {
    return (await request(`${BASE}/requests`)).json()
  },

  async setRequestStatus(id, status, reason = '') {
    const res = await request(`${BASE}/requests/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    })
    return res.json()
  },

  async deleteRequest(id) {
    await request(`${BASE}/requests/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  /** @returns {{ data: Array, version: string }} */
  async load(entity) {
    const res = await request(`${BASE}/${entity}`)
    return { data: await res.json(), version: versionOf(res) }
  },

  /**
   * Saves the whole collection.
   *
   * `version` is the one received at the last load: the server refuses the
   * write (409) if the data changed meanwhile, which stops a second tab from
   * silently overwriting the first one's work.
   *
   * Throws an ApiError on failure — a silent failure would let the user
   * believe their changes were saved.
   */
  async save(entity, data, version) {
    const res = await request(`${BASE}/${entity}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': version ?? '' },
      body: JSON.stringify(data),
    })
    const body = await res.json()
    return { version: body.version ?? versionOf(res) }
  },
}
