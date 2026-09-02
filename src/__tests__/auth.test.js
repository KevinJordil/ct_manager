import { describe, it, expect, vi } from 'vitest'
import { createAuth, resolvePassword } from '../../auth.js'

const PASSWORD = 'correct horse battery staple'

function makeAuth(overrides = {}) {
  return createAuth({ password: PASSWORD, ...overrides })
}

/** Minimal Express-like request carrying an Authorization header */
const requestWith = token => ({ get: name => (name === 'Authorization' ? token : undefined) })

describe('login', () => {
  it('accepts the right password and issues a token', () => {
    const session = makeAuth().login(PASSWORD)
    expect(session.token).toMatch(/^[0-9a-f]{64}$/)
    expect(session.expiresAt).toBeGreaterThan(Date.now())
  })

  it('refuses a wrong password', () => {
    expect(makeAuth().login('wrong')).toBeNull()
  })

  it('refuses a password of a different length without leaking it', () => {
    const auth = makeAuth()
    expect(auth.login('short')).toBeNull()
    expect(auth.login(PASSWORD + 'x')).toBeNull()
  })

  it('refuses anything that is not a string', () => {
    const auth = makeAuth()
    for (const candidate of [undefined, null, 42, {}, []]) {
      expect(auth.login(candidate)).toBeNull()
    }
  })

  it('never returns the password as the token', () => {
    expect(makeAuth().login(PASSWORD).token).not.toBe(PASSWORD)
  })

  it('issues a distinct token on each login', () => {
    const auth = makeAuth()
    const first = auth.login(PASSWORD).token
    const second = auth.login(PASSWORD).token
    expect(first).not.toBe(second)
  })
})

describe('session validity', () => {
  it('accepts a freshly issued token', () => {
    const auth = makeAuth()
    expect(auth.isValid(auth.login(PASSWORD).token)).toBe(true)
  })

  it('rejects an unknown or empty token', () => {
    const auth = makeAuth()
    expect(auth.isValid('deadbeef')).toBe(false)
    expect(auth.isValid('')).toBe(false)
    expect(auth.isValid(undefined)).toBe(false)
  })

  it('rejects a token past its expiry', () => {
    let clock = 1_000
    const auth = makeAuth({ ttlMs: 100, now: () => clock })
    const { token } = auth.login(PASSWORD)
    expect(auth.isValid(token)).toBe(true)

    clock += 101
    expect(auth.isValid(token)).toBe(false)
  })

  it('forgets an expired token instead of keeping it around', () => {
    let clock = 1_000
    const auth = makeAuth({ ttlMs: 100, now: () => clock })
    auth.login(PASSWORD)
    expect(auth.sessionCount()).toBe(1)

    clock += 101
    auth.login(PASSWORD) // triggers the purge
    expect(auth.sessionCount()).toBe(1)
  })
})

describe('logout', () => {
  it('revokes only the token given', () => {
    const auth = makeAuth()
    const first = auth.login(PASSWORD).token
    const second = auth.login(PASSWORD).token

    auth.logout(first)
    expect(auth.isValid(first)).toBe(false)
    expect(auth.isValid(second)).toBe(true)
  })

  it('is harmless on an unknown token', () => {
    expect(makeAuth().logout('never-issued')).toBe(false)
  })
})

describe('requireAuth middleware', () => {
  function runMiddleware(auth, token) {
    let nextCalled = false
    let status = null
    let body = null
    const res = {
      status(code) { status = code; return this },
      json(payload) { body = payload; return this },
    }
    auth.requireAuth(requestWith(token), res, () => { nextCalled = true })
    return { nextCalled, status, body }
  }

  it('lets a valid session through', () => {
    const auth = makeAuth()
    const { token } = auth.login(PASSWORD)
    expect(runMiddleware(auth, `Bearer ${token}`).nextCalled).toBe(true)
  })

  it('answers 401 with a translatable code otherwise', () => {
    const result = runMiddleware(makeAuth(), 'Bearer nope')
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(401)
    expect(result.body.code).toBe('auth.required')
  })

  it('rejects a header that is not a Bearer token', () => {
    const auth = makeAuth()
    const { token } = auth.login(PASSWORD)
    expect(runMiddleware(auth, token).nextCalled).toBe(false)
    expect(runMiddleware(auth, `Basic ${token}`).nextCalled).toBe(false)
    expect(runMiddleware(auth, undefined).nextCalled).toBe(false)
  })
})

describe('resolvePassword', () => {
  it('uses CT_PASSWORD when it is set', () => {
    const log = { warn: vi.fn() }
    expect(resolvePassword({ CT_PASSWORD: 'chosen' }, log))
      .toEqual({ password: 'chosen', generated: false })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('generates and announces one otherwise', () => {
    const log = { warn: vi.fn() }
    const { password, generated } = resolvePassword({}, log)
    expect(generated).toBe(true)
    expect(password.length).toBeGreaterThanOrEqual(12)
    expect(log.warn).toHaveBeenCalled()
    // The generated password has to be readable by the operator.
    expect(log.warn.mock.calls.flat().join(' ')).toContain(password)
  })

  it('never falls back to a fixed default', () => {
    const first = resolvePassword({}, { warn: () => {} }).password
    const second = resolvePassword({}, { warn: () => {} }).password
    expect(first).not.toBe(second)
  })
})
