import { describe, it, expect, vi } from 'vitest'
import { createSessions, resolveInitialPassword } from '../../auth.js'

function sessions(overrides = {}) {
  let clock = 1_000
  const instance = createSessions({ ttlMs: 1000, now: () => clock, ...overrides })
  return { ...instance, advance: ms => { clock += ms } }
}

describe('issuing sessions', () => {
  it('hands out a random token bound to an account', () => {
    const store = sessions()
    const { token, expiresAt } = store.issue('user-1')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(expiresAt).toBeGreaterThan(1_000)
    expect(store.userIdFor(token)).toBe('user-1')
  })

  it('issues a different token every time', () => {
    const store = sessions()
    expect(store.issue('user-1').token).not.toBe(store.issue('user-1').token)
  })

  it('lets one account hold several sessions', () => {
    const store = sessions()
    const phone = store.issue('user-1').token
    const desktop = store.issue('user-1').token
    expect(store.userIdFor(phone)).toBe('user-1')
    expect(store.userIdFor(desktop)).toBe('user-1')
  })
})

describe('validity', () => {
  it('rejects an unknown or empty token', () => {
    const store = sessions()
    expect(store.userIdFor('deadbeef')).toBeNull()
    expect(store.userIdFor('')).toBeNull()
    expect(store.userIdFor(undefined)).toBeNull()
  })

  it('rejects a token past its expiry', () => {
    const store = sessions()
    const { token } = store.issue('user-1')
    expect(store.userIdFor(token)).toBe('user-1')

    store.advance(1001)
    expect(store.userIdFor(token)).toBeNull()
  })

  it('forgets expired sessions instead of keeping them', () => {
    const store = sessions()
    store.issue('user-1')
    expect(store.count()).toBe(1)

    store.advance(1001)
    store.issue('user-2') // triggers the purge
    expect(store.count()).toBe(1)
  })
})

describe('revoking', () => {
  it('revokes a single token', () => {
    const store = sessions()
    const first = store.issue('user-1').token
    const second = store.issue('user-1').token

    store.revoke(first)
    expect(store.userIdFor(first)).toBeNull()
    expect(store.userIdFor(second)).toBe('user-1')
  })

  it('revokes every session of an account, which a password change must do', () => {
    const store = sessions()
    const phone = store.issue('user-1').token
    const desktop = store.issue('user-1').token
    const other = store.issue('user-2').token

    expect(store.revokeUser('user-1')).toBe(2)
    expect(store.userIdFor(phone)).toBeNull()
    expect(store.userIdFor(desktop)).toBeNull()
    expect(store.userIdFor(other)).toBe('user-2')
  })

  it('is harmless on an unknown token or account', () => {
    const store = sessions()
    expect(store.revoke('never-issued')).toBe(false)
    expect(store.revokeUser('nobody')).toBe(0)
  })
})

describe('tokenFrom', () => {
  const requestWith = value => ({ get: name => (name === 'Authorization' ? value : undefined) })

  it('reads a Bearer token', () => {
    expect(sessions().tokenFrom(requestWith('Bearer abc'))).toBe('abc')
  })

  it('ignores anything else', () => {
    const store = sessions()
    expect(store.tokenFrom(requestWith('Basic abc'))).toBe('')
    expect(store.tokenFrom(requestWith('abc'))).toBe('')
    expect(store.tokenFrom(requestWith(undefined))).toBe('')
    expect(store.tokenFrom({})).toBe('')
  })
})

describe('resolveInitialPassword', () => {
  it('uses CT_PASSWORD when it is set', () => {
    const log = { warn: vi.fn() }
    expect(resolveInitialPassword({ CT_PASSWORD: 'chosen' }, log))
      .toEqual({ password: 'chosen', generated: false })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('generates and announces one otherwise', () => {
    const log = { warn: vi.fn() }
    const { password, generated } = resolveInitialPassword({}, log)
    expect(generated).toBe(true)
    expect(password.length).toBeGreaterThanOrEqual(12)
    expect(log.warn.mock.calls.flat().join(' ')).toContain(password)
  })

  it('never falls back to a fixed default', () => {
    const quiet = { warn: () => {} }
    expect(resolveInitialPassword({}, quiet).password)
      .not.toBe(resolveInitialPassword({}, quiet).password)
  })
})
