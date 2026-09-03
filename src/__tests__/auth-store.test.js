import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const calls = vi.hoisted(() => ({ login: null, me: null }))

vi.mock('../api.js', () => ({
  api: {
    login: (...args) => calls.login(...args),
    me: (...args) => calls.me(...args),
    logout: async () => {},
  },
  setSessionToken: () => {},
  hasSessionToken: () => true,
}))

const { useAuthStore } = await import('../stores/auth.js')
const { useSync } = await import('../stores/sync.js')
const { reportAuthRequired, clearError } = await import('../stores/sync.js')

const sync = useSync()

beforeEach(() => {
  setActivePinia(createPinia())
  clearError()
  calls.login = async () => ({ token: 't', user: { username: 'admin', role: 'admin' } })
  calls.me = async () => ({ username: 'admin', role: 'admin' })
})

describe('signing in after a session was lost', () => {
  it('takes down the expiry banner, which the new session answers', async () => {
    // What a server restart leaves behind: loads made with the stale token.
    reportAuthRequired()
    expect(sync.error.value.key).toBe('auth.sessionExpired')

    await useAuthStore().login('admin', 'admin')

    expect(sync.error.value).toBe(null)
    expect(sync.authRequired.value).toBe(false)
  })

  it('takes it down as well when the stored token turns out to be valid', async () => {
    reportAuthRequired()
    expect(await useAuthStore().verify()).toBe(true)
    expect(sync.error.value).toBe(null)
  })

  it('leaves the banner alone when the stored token is refused', async () => {
    reportAuthRequired()
    calls.me = async () => { throw new Error('401') }
    expect(await useAuthStore().verify()).toBe(false)
    expect(sync.error.value.key).toBe('auth.sessionExpired')
  })

  it('does not hide a genuine save failure raised after signing in', async () => {
    const auth = useAuthStore()
    await auth.login('admin', 'admin')
    const { reportError } = await import('../stores/sync.js')
    reportError('errors.saveFailed', {}, { context: 'save' })
    expect(sync.error.value.key).toBe('errors.saveFailed')
  })
})
