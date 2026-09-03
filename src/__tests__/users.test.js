import { describe, it, expect } from 'vitest'
import {
  hashPassword, verifyPassword, suggestUsername, validateUsername, validatePassword,
  publicUser, isLastAdmin, ROLES, MIN_PASSWORD_LENGTH,
} from '../../users.js'

describe('password hashing', () => {
  it('never stores the password itself', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(stored.digest).not.toContain('horse')
    expect(stored.digest).toMatch(/^[0-9a-f]{128}$/)
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/)
  })

  it('salts each account differently, so equal passwords differ on disk', () => {
    const a = hashPassword('same-password')
    const b = hashPassword('same-password')
    expect(a.salt).not.toBe(b.salt)
    expect(a.digest).not.toBe(b.digest)
  })

  it('accepts the right password and refuses the others', () => {
    const stored = hashPassword('right-password')
    expect(verifyPassword('right-password', stored)).toBe(true)
    expect(verifyPassword('wrong-password', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
  })

  it('refuses anything that is not a string, and incomplete records', () => {
    const stored = hashPassword('right-password')
    for (const value of [undefined, null, 42, {}]) {
      expect(verifyPassword(value, stored)).toBe(false)
    }
    expect(verifyPassword('right-password', {})).toBe(false)
    expect(verifyPassword('right-password', { salt: stored.salt })).toBe(false)
  })
})

describe('suggestUsername', () => {
  it('builds an initial plus the family name', () => {
    expect(suggestUsername('Andreas', 'Müller')).toBe('amuller')
    expect(suggestUsername('Pierre', 'Dubois')).toBe('pdubois')
  })

  it('strips accents and punctuation', () => {
    expect(suggestUsername('Élise', 'Michaud')).toBe('emichaud')
    expect(suggestUsername('Jean-Luc', "D'Amico")).toBe('jdamico')
  })

  it('copes with a missing name', () => {
    expect(suggestUsername('', 'Rossier')).toBe('rossier')
    expect(suggestUsername('Marc', '')).toBe('m')
  })
})

describe('validateUsername', () => {
  const existing = [{ id: 'u1', username: 'amuller' }]

  it('accepts a plain lowercase name', () => {
    expect(validateUsername('cfavre', existing)).toBeNull()
    expect(validateUsername('a.b-c_d', existing)).toBeNull()
  })

  it('refuses uppercase, spaces, accents and anything too short', () => {
    for (const name of ['AMuller', 'a muller', 'amüller', 'ab', '']) {
      expect(validateUsername(name, existing)).toMatchObject({ code: 'invalidUsername' })
    }
  })

  it('refuses a name already taken', () => {
    expect(validateUsername('amuller', existing))
      .toMatchObject({ code: 'usernameTaken', params: { username: 'amuller' } })
  })

  it('lets an account keep its own name', () => {
    expect(validateUsername('amuller', existing, 'u1')).toBeNull()
  })
})

describe('validatePassword', () => {
  it('demands a minimum length', () => {
    expect(validatePassword('x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
    expect(validatePassword('short')).toMatchObject({ code: 'passwordTooShort' })
    expect(validatePassword(undefined)).toMatchObject({ code: 'passwordTooShort' })
  })
})

describe('publicUser', () => {
  it('strips the secrets', () => {
    const user = { id: 'u1', username: 'a', role: ROLES.USER, personId: 'p1', createdAt: 'x', ...hashPassword('pw') }
    const exposed = publicUser(user)
    expect(exposed).toEqual({ id: 'u1', username: 'a', role: 'user', personId: 'p1', createdAt: 'x' })
    expect(exposed).not.toHaveProperty('salt')
    expect(exposed).not.toHaveProperty('digest')
  })
})

describe('isLastAdmin', () => {
  const admin = id => ({ id, role: ROLES.ADMIN })
  const user = id => ({ id, role: ROLES.USER })

  it('recognises the only administrator', () => {
    expect(isLastAdmin([admin('a1'), user('u1')], 'a1')).toBe(true)
  })

  it('is false when another administrator remains', () => {
    expect(isLastAdmin([admin('a1'), admin('a2')], 'a1')).toBe(false)
  })

  it('is false for an ordinary account', () => {
    expect(isLastAdmin([admin('a1'), user('u1')], 'u1')).toBe(false)
  })
})
