import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = vi.hoisted(() => ({ load: null, save: null }))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(message, { status = null, code = null, params = {} } = {}) {
      super(message)
      this.status = status
      this.code = code
      this.params = params
    }
  },
  api: {
    load: (...args) => calls.load(...args),
    save: (...args) => calls.save(...args),
  },
}))

const { useCollection } = await import('../stores/collection.js')
const { useSync } = await import('../stores/sync.js')
const { ApiError } = await import('../api.js')

const sync = useSync()

beforeEach(() => {
  sync.clearError()
  calls.load = async () => ({ data: [], version: 'v1' })
  calls.save = async () => ({ version: 'v2' })
})

/** Lets pending promises settle */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useCollection — loading', () => {
  it('loads the data and applies the migration', async () => {
    calls.load = async () => ({ data: [{ id: 'a' }], version: 'v1' })
    const collection = useCollection('persons', data => data.map(d => ({ ...d, migrated: true })))
    await collection.init()
    expect(collection.items.value).toEqual([{ id: 'a', migrated: true }])
  })

  it('loads only once even if several views ask for it', async () => {
    let loads = 0
    calls.load = async () => { loads++; return { data: [], version: 'v1' } }
    const collection = useCollection('persons')
    await Promise.all([collection.init(), collection.init(), collection.init()])
    expect(loads).toBe(1)
  })

  it('reports a load failure', async () => {
    calls.load = async () => { throw new ApiError('Server unreachable') }
    const collection = useCollection('persons')
    await collection.init()
    expect(sync.error.value.key).toBe('errors.loadFailed')
    expect(sync.error.value.context).toBe('load')
  })

  it('renders a coded server error under its own key', async () => {
    calls.load = async () => { throw new ApiError('bad', { status: 400, code: 'validation.notAnArray', params: {} }) }
    const collection = useCollection('persons')
    await collection.init()
    expect(sync.error.value.key).toBe('server.validation.notAnArray')
  })

  it('reload starts a fresh request', async () => {
    let loads = 0
    calls.load = async () => { loads++; return { data: [], version: `v${loads}` } }
    const collection = useCollection('persons')
    await collection.init()
    await collection.reload()
    expect(loads).toBe(2)
  })
})

describe('useCollection — saving', () => {
  it('sends the version received on load', async () => {
    const seen = []
    calls.save = async (_entity, _data, version) => { seen.push(version); return { version: 'v2' } }
    const collection = useCollection('persons')
    await collection.init()
    collection.add({ lastName: 'X' })
    await settle()
    expect(seen).toEqual(['v1'])
  })

  it('uses the new version on the next save', async () => {
    const seen = []
    let counter = 1
    calls.save = async (_entity, _data, version) => { seen.push(version); return { version: `v${++counter}` } }
    const collection = useCollection('persons')
    await collection.init()
    collection.add({ lastName: 'X' }); await settle()
    collection.add({ lastName: 'Y' }); await settle()
    expect(seen).toEqual(['v1', 'v2'])
  })

  it('refuses to save when the load failed', async () => {
    calls.load = async () => { throw new ApiError('Server unreachable') }
    let saves = 0
    calls.save = async () => { saves++; return { version: 'v2' } }

    const collection = useCollection('persons')
    await collection.init()
    collection.add({ lastName: 'X' })
    await settle()

    // Without this guard the empty in-memory collection would wipe the server.
    expect(saves).toBe(0)
    expect(sync.error.value.key).toBe('errors.notLoaded')
  })

  it('reports a conflict with another tab', async () => {
    calls.save = async () => { throw new ApiError('conflict', { status: 409, code: 'conflict', params: { version: 'v9' } }) }
    const collection = useCollection('persons')
    await collection.init()
    collection.add({ lastName: 'X' })
    await settle()
    expect(sync.conflict.value).toBe(true)
    expect(sync.error.value.key).toBe('errors.conflict')
  })

  it('reports an expired session', async () => {
    calls.save = async () => { throw new ApiError('session', { status: 401, code: 'auth.required' }) }
    const collection = useCollection('persons')
    await collection.init()
    collection.add({ lastName: 'X' })
    await settle()
    expect(sync.authRequired.value).toBe(true)
    expect(sync.error.value.key).toBe('auth.sessionExpired')
  })

  it('clears the error after a successful save', async () => {
    const collection = useCollection('persons')
    await collection.init()
    calls.save = async () => { throw new ApiError('Server unreachable') }
    collection.add({ lastName: 'X' }); await settle()
    expect(sync.error.value).not.toBeNull()

    calls.save = async () => ({ version: 'v3' })
    collection.add({ lastName: 'Y' }); await settle()
    expect(sync.error.value).toBeNull()
  })
})

describe('useCollection — CRUD', () => {
  it('adds with a unique identifier', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const first = collection.add({ lastName: 'A' })
    const second = collection.add({ lastName: 'B' })
    expect(first.id).not.toBe(second.id)
    expect(collection.items.value).toHaveLength(2)
  })

  it('updates without letting the identifier be rewritten', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = collection.add({ lastName: 'A' })
    collection.update(item.id, { lastName: 'B', id: 'spoofed' })
    expect(collection.items.value[0]).toMatchObject({ id: item.id, lastName: 'B' })
  })

  it('ignores an update to a missing item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    collection.update('ghost', { lastName: 'X' })
    expect(collection.items.value).toEqual([])
  })

  it('removes an item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = collection.add({ lastName: 'A' })
    collection.remove(item.id)
    expect(collection.items.value).toEqual([])
  })

  it('mutate applies the change to the target item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = collection.add({ lastName: 'A' })
    collection.mutate(item.id, person => { person.lastName = 'Changed' })
    expect(collection.items.value[0].lastName).toBe('Changed')
  })
})
