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

/** Lowercase, unaccented, letters and digits only: "Müller" → "muller" */
export function normaliseName(text = '') {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * A person signs in with their family name, so that is their username.
 * Two people sharing a family name cannot both hold an account; the person
 * form says so rather than silently overwriting one.
 */
export function usernameFromLastName(lastName = '') {
  return normaliseName(lastName).slice(0, 32)
}

/** Suggests a username from a person's name: "Andreas Müller" → "amuller" */
export function suggestUsername(firstName = '', lastName = '') {
  const initial = normaliseName(firstName).slice(0, 1)
  return `${initial}${normaliseName(lastName)}`.slice(0, 32)
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

/**
 * Passwords carry no length or composition rule: this runs on a closed
 * network, and a rule people work around with a suffix buys nothing. The
 * only requirement is that there is one — an account without a password is
 * how "cannot sign in yet" is expressed.
 *
 * @returns {{code: string, params: object}|null}
 */
export function validatePassword(password) {
  if (typeof password !== 'string' || password === '') {
    return { code: 'passwordEmpty', params: {} }
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
