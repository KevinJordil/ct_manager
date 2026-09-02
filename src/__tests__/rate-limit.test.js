import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../../rate-limit.js'

function limiter(overrides = {}) {
  let clock = 0
  const instance = createRateLimiter({ windowMs: 1000, max: 3, now: () => clock, ...overrides })
  return { ...instance, advance: ms => { clock += ms }, clockAt: () => clock }
}

describe('createRateLimiter', () => {
  it('lets the budget through, then blocks', () => {
    const rl = limiter()
    expect(rl.hit('a')).toBe(false)
    expect(rl.hit('a')).toBe(false)
    expect(rl.hit('a')).toBe(false)
    expect(rl.hit('a')).toBe(true)
  })

  it('counts each client separately', () => {
    const rl = limiter()
    for (let i = 0; i < 3; i++) rl.hit('a')
    expect(rl.hit('a')).toBe(true)
    expect(rl.hit('b')).toBe(false)
  })

  it('forgives once the window has passed', () => {
    const rl = limiter()
    for (let i = 0; i < 3; i++) rl.hit('a')
    expect(rl.hit('a')).toBe(true)

    rl.advance(1001)
    expect(rl.hit('a')).toBe(false)
  })

  it('slides rather than resetting in blocks', () => {
    const rl = limiter()
    rl.hit('a')
    rl.advance(600)
    rl.hit('a')
    rl.hit('a')
    expect(rl.hit('a')).toBe(true)

    // The first hit leaves the window, freeing exactly one slot.
    rl.advance(401)
    expect(rl.hit('a')).toBe(false)
    expect(rl.hit('a')).toBe(true)
  })

  it('reports how long to wait', () => {
    const rl = limiter()
    for (let i = 0; i < 3; i++) rl.hit('a')
    expect(rl.retryAfter('a')).toBe(1)

    rl.advance(400)
    expect(rl.retryAfter('a')).toBe(1)
  })

  it('reports no wait for a client under budget', () => {
    const rl = limiter()
    rl.hit('a')
    expect(rl.retryAfter('a')).toBe(0)
    expect(rl.retryAfter('unknown')).toBe(0)
  })

  it('reset clears a client, which is what a successful login does', () => {
    const rl = limiter()
    for (let i = 0; i < 3; i++) rl.hit('a')
    expect(rl.hit('a')).toBe(true)

    rl.reset('a')
    expect(rl.hit('a')).toBe(false)
  })
})
