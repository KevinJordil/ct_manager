import crypto from 'crypto'

/**
 * Password login with server-side session tokens.
 *
 * The token handed to the browser is random and unrelated to the password:
 * a stolen token grants a session that can be revoked, never the password
 * itself.
 */

const TOKEN_BYTES = 32
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function createAuth({ password, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const sessions = new Map() // token → expiry timestamp

  function purgeExpired() {
    const current = now()
    for (const [token, expiry] of sessions) {
      if (expiry <= current) sessions.delete(token)
    }
  }

  /** Constant-time comparison, so timing cannot reveal the password */
  function passwordMatches(candidate) {
    if (typeof candidate !== 'string') return false
    const a = Buffer.from(candidate)
    const b = Buffer.from(password)
    // Hash both sides first: timingSafeEqual needs equal lengths, and
    // comparing raw buffers would leak the password length.
    const ha = crypto.createHash('sha256').update(a).digest()
    const hb = crypto.createHash('sha256').update(b).digest()
    return crypto.timingSafeEqual(ha, hb)
  }

  /** @returns {{token: string, expiresAt: number}|null} null when the password is wrong */
  function login(candidate) {
    if (!passwordMatches(candidate)) return null
    purgeExpired()
    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
    const expiresAt = now() + ttlMs
    sessions.set(token, expiresAt)
    return { token, expiresAt }
  }

  function isValid(token) {
    if (!token) return false
    const expiry = sessions.get(token)
    if (expiry === undefined) return false
    if (expiry <= now()) {
      sessions.delete(token)
      return false
    }
    return true
  }

  function logout(token) {
    return sessions.delete(token)
  }

  function tokenFrom(req) {
    const header = req.get?.('Authorization') ?? ''
    return header.startsWith('Bearer ') ? header.slice(7) : ''
  }

  /** Express middleware protecting a route */
  function requireAuth(req, res, next) {
    if (isValid(tokenFrom(req))) return next()
    res.status(401).json({
      code: 'auth.required',
      params: {},
      error: 'Authentication required',
    })
  }

  return { login, logout, isValid, requireAuth, tokenFrom, sessionCount: () => sessions.size }
}

/**
 * Resolves the admin password. Without CT_PASSWORD a random one is generated
 * and printed once: an application reachable over a network must never fall
 * back to a well-known default.
 */
export function resolvePassword(env = process.env, log = console) {
  if (env.CT_PASSWORD) return { password: env.CT_PASSWORD, generated: false }
  const password = crypto.randomBytes(9).toString('base64url')
  log.warn('⚠  CT_PASSWORD is not set. Generated password for this run:')
  log.warn(`   ${password}`)
  log.warn('   Set CT_PASSWORD to keep the same password across restarts.')
  return { password, generated: true }
}
