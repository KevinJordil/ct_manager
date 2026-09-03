import crypto from 'crypto'

/**
 * User accounts, stored hashed.
 *
 * Passwords are never kept in clear: each account carries a random salt and
 * an scrypt digest. Comparison is constant-time, so neither the digest nor
 * its length leaks through timing.
 */

const SALT_BYTES = 16
const KEY_LENGTH = 64
const SCRYPT_COST = 16384

export const ROLES = { ADMIN: 'admin', USER: 'user' }
export const ROLE_VALUES = Object.values(ROLES)

/** Usernames are lowercase and unambiguous, since they are typed at login. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/

export const MIN_PASSWORD_LENGTH = 8

export function hashPassword(password, salt = crypto.randomBytes(SALT_BYTES).toString('hex')) {
  const digest = crypto.scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST }).toString('hex')
  return { salt, digest }
}

export function verifyPassword(password, { salt, digest }) {
  if (typeof password !== 'string' || !salt || !digest) return false
  const candidate = crypto.scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST })
  const stored = Buffer.from(digest, 'hex')
  if (candidate.length !== stored.length) return false
  return crypto.timingSafeEqual(candidate, stored)
}

/** Suggests a username from a person's name: "Andreas Müller" → "amuller" */
export function suggestUsername(firstName = '', lastName = '') {
  const strip = text => text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
  const initial = strip(firstName).slice(0, 1)
  const family = strip(lastName)
  return `${initial}${family}`.slice(0, 32)
}

/** @returns {{code: string, params: object}|null} */
export function validateUsername(username, existing = [], selfId = null) {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return { code: 'invalidUsername', params: {} }
  }
  if (existing.some(user => user.username === username && user.id !== selfId)) {
    return { code: 'usernameTaken', params: { username } }
  }
  return null
}

/** @returns {{code: string, params: object}|null} */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { code: 'passwordTooShort', params: { min: MIN_PASSWORD_LENGTH } }
  }
  return null
}

/** Strips the secrets before an account ever leaves the server. */
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    personId: user.personId ?? null,
    createdAt: user.createdAt,
  }
}

export function isLastAdmin(users, userId) {
  const admins = users.filter(user => user.role === ROLES.ADMIN)
  return admins.length === 1 && admins[0].id === userId
}
