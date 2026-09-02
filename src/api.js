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
   * Exchanges the password for a session token.
   * @returns {{ token: string, expiresAt: number }}
   */
  async login(password) {
    const res = await request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.json()
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
