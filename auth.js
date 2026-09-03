import crypto from 'crypto'

/**
 * Server-side sessions.
 *
 * The token handed to the browser is random and unrelated to any password:
 * a stolen token grants a session that can be revoked, never a credential.
 * Sessions live in memory, so a restart signs everybody out — acceptable for
 * a single-process deployment, and the safest default.
 */

const TOKEN_BYTES = 32
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function createSessions({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const sessions = new Map() // token → { userId, expiresAt }

  function purgeExpired() {
    const current = now()
    for (const [token, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(token)
    }
  }

  function issue(userId) {
    purgeExpired()
    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
    const expiresAt = now() + ttlMs
    sessions.set(token, { userId, expiresAt })
    return { token, expiresAt }
  }

  /** @returns {string|null} the account id, or null when the token is dead */
  function userIdFor(token) {
    if (!token) return null
    const session = sessions.get(token)
    if (!session) return null
    if (session.expiresAt <= now()) {
      sessions.delete(token)
      return null
    }
    return session.userId
  }

  function revoke(token) {
    return sessions.delete(token)
  }

  /** Ends every session of an account — used when it is deleted or its password changes. */
  function revokeUser(userId) {
    let removed = 0
    for (const [token, session] of sessions) {
      if (session.userId === userId) {
        sessions.delete(token)
        removed++
      }
    }
    return removed
  }

  function tokenFrom(req) {
    const header = req.get?.('Authorization') ?? ''
    return header.startsWith('Bearer ') ? header.slice(7) : ''
  }

  return { issue, userIdFor, revoke, revokeUser, tokenFrom, count: () => sessions.size }
}

/**
 * Password of the initial administrator, used only when no account exists yet.
 * Without CT_PASSWORD a random one is generated and printed once: an
 * application reachable over a network must never fall back to a known value.
 */
export function resolveInitialPassword(env = process.env, log = console) {
  if (env.CT_PASSWORD) return { password: env.CT_PASSWORD, generated: false }
  const password = crypto.randomBytes(9).toString('base64url')
  log.warn('⚠  No account yet and CT_PASSWORD is not set.')
  log.warn(`   Administrator "admin" created with the password: ${password}`)
  log.warn('   Change it after signing in, or set CT_PASSWORD before the first start.')
  return { password, generated: true }
}
