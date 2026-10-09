import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = vi.hoisted(() => ({ load: null, create: null, update: null, remove: null, sent: [] }))

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
    createItem: (...args) => { calls.sent.push(['create', ...args]); return calls.create(...args) },
    updateItem: (...args) => { calls.sent.push(['update', ...args]); return calls.update(...args) },
    deleteItem: (...args) => { calls.sent.push(['delete', ...args]); return calls.remove(...args) },
  },
}))

const { useCollection } = await import('../stores/collection.js')
const { useSync } = await import('../stores/sync.js')
const { ApiError } = await import('../api.js')

const sync = useSync()
const answer = item => ({ item, version: 'v2', previous: 'v1' })

beforeEach(() => {
  sync.clearError()
  calls.sent = []
  calls.load = async () => ({ data: [], version: 'v1' })
  calls.create = async (_entity, item) => answer(item)
  calls.update = async (_entity, _id, item) => answer(item)
  calls.remove = async () => ({ ok: true, version: 'v2', previous: 'v1' })
})

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

describe('useCollection — one record at a time', () => {
  it('sends only the record created, with a unique identifier', async () => {
    const collection = useCollection('missions')
    await collection.init()
    const first = await collection.add({ title: 'A' })
    const second = await collection.add({ title: 'B' })
    expect(first.id).not.toBe(second.id)
    expect(calls.sent.map(([kind, entity, item]) => [kind, entity, item.title])).toEqual([
      ['create', 'missions', 'A'], ['create', 'missions', 'B'],
    ])
  })

  it('shows a change at once, before the server answers', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const pending = collection.add({ lastName: 'A' })
    expect(collection.items.value).toHaveLength(1)
    await pending
  })

  it('sends a change with the record as it was seen, and never lets the identifier be rewritten', async () => {
    calls.load = async () => ({ data: [{ id: 'a', lastName: 'A' }], version: 'v1' })
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.update('a', { lastName: 'B', id: 'spoofed' })).toBe(true)
    expect(calls.sent[0]).toEqual(['update', 'persons', 'a', { id: 'a', lastName: 'B' }, { id: 'a', lastName: 'A' }])
    expect(collection.items.value[0]).toEqual({ id: 'a', lastName: 'B' })
  })

  it('ignores an update to a missing item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.update('ghost', { lastName: 'X' })).toBe(false)
    expect(calls.sent).toEqual([])
  })

  it('removes an item', async () => {
    calls.load = async () => ({ data: [{ id: 'a' }], version: 'v1' })
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.remove('a')).toBe(true)
    expect(calls.sent).toEqual([['delete', 'persons', 'a']])
    expect(collection.items.value).toEqual([])
  })

  it('mutate applies the change to a copy of the target item', async () => {
    calls.load = async () => ({ data: [{ id: 'a', leaves: [] }], version: 'v1' })
    const collection = useCollection('persons')
    await collection.init()
    await collection.mutate('a', person => { person.leaves.push({ id: 'l' }) })
    expect(calls.sent[0][4]).toEqual({ id: 'a', leaves: [] })
    expect(collection.items.value[0].leaves).toEqual([{ id: 'l' }])
  })

  it('takes back the record the server stored', async () => {
    calls.load = async () => ({ data: [{ id: 'a' }], version: 'v1' })
    calls.update = async (_entity, _id, item) => answer({ ...item, stamped: true })
    const collection = useCollection('vehicles')
    await collection.init()
    await collection.update('a', { name: 'Duro' })
    expect(collection.items.value[0]).toEqual({ id: 'a', name: 'Duro', stamped: true })
  })

  it('refuses to save when the load failed', async () => {
    calls.load = async () => { throw new ApiError('Server unreachable') }
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.add({ lastName: 'X' })).toBeNull()
    // Without this guard nothing on screen would reflect the server.
    expect(calls.sent).toEqual([])
    expect(sync.error.value.key).toBe('errors.notLoaded')
  })
})

describe('somebody else working at the same time', () => {
  it('never stops a creation, whatever happened to other records', async () => {
    let loads = 0
    calls.load = async () => ({ data: [{ id: 'old', title: loads++ ? 'changed elsewhere' : 'old' }], version: `v${loads}` })
    const collection = useCollection('missions')
    await collection.init()
    // Another counter changed "old" meanwhile; nobody asks the server about it.
    expect(await collection.add({ title: 'new' })).not.toBeNull()
  })

  it('refuses a change to a record somebody else changed, and shows theirs', async () => {
    let loads = 0
    calls.load = async () => ({ data: [{ id: 'm', title: loads++ ? 'Theirs' : 'Mine' }], version: `v${loads}` })
    calls.update = async () => { throw new ApiError('conflict', { status: 409, code: 'conflict', params: { entity: 'missions' } }) }
    const collection = useCollection('missions')
    await collection.init()
    expect(await collection.update('m', { title: 'Edited' })).toBe(false)
    expect(collection.items.value).toEqual([{ id: 'm', title: 'Theirs' }])
    expect(sync.error.value.key).toBe('errors.conflict')
    expect(sync.conflict.value).toBe(true)
  })

  it('says a record deleted elsewhere is gone', async () => {
    let loads = 0
    calls.load = async () => ({ data: loads++ ? [] : [{ id: 'm' }], version: `v${loads}` })
    calls.update = async () => { throw new ApiError('gone', { status: 404, code: 'gone', params: { entity: 'missions' } }) }
    const collection = useCollection('missions')
    await collection.init()
    expect(await collection.update('m', { title: 'x' })).toBe(false)
    expect(collection.items.value).toEqual([])
    expect(sync.error.value.key).toBe('server.gone')
  })
})

describe('refusals', () => {
  it('takes back an addition the server refused', async () => {
    calls.create = async () => { throw new ApiError('unreachable') }
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.add({ lastName: 'A' })).toBeNull()
    expect(collection.items.value).toEqual([])
    expect(sync.error.value.key).toBe('errors.saveFailed')
  })

  it('reports an expired session', async () => {
    calls.create = async () => { throw new ApiError('session', { status: 401, code: 'auth.required' }) }
    const collection = useCollection('persons')
    await collection.init()
    await collection.add({ lastName: 'X' })
    expect(sync.authRequired.value).toBe(true)
    expect(sync.error.value.key).toBe('auth.sessionExpired')
  })

  it('clears the error after a successful save', async () => {
    const collection = useCollection('persons')
    await collection.init()
    calls.create = async () => { throw new ApiError('Server unreachable') }
    await collection.add({ lastName: 'X' })
    expect(sync.error.value).not.toBeNull()
    calls.create = async (_entity, item) => answer(item)
    await collection.add({ lastName: 'Y' })
    expect(sync.error.value).toBeNull()
  })

  it('restores a deleted record and reports the actual blocker', async () => {
    calls.load = async () => ({ data: [{ id: 'a', name: 'Duro' }], version: 'v1' })
    calls.remove = async () => { throw new ApiError('blocked', { status: 409, code: 'deletion.keys', params: { vehicles: 'M1' } }) }
    const collection = useCollection('vehicles')
    await collection.init()
    expect(await collection.remove('a')).toBe(false)
    expect(collection.items.value).toEqual([{ id: 'a', name: 'Duro' }])
    expect(sync.error.value.key).toBe('server.deletion.keys')
    expect(sync.conflict.value).toBe(false)
  })

  it('restores a mission if cancellation fails to save', async () => {
    calls.load = async () => ({ data: [{ id: 'a', title: 'Transport' }], version: 'v1' })
    calls.update = async () => { throw new ApiError('unreachable') }
    const collection = useCollection('missions')
    await collection.init()
    expect(await collection.update('a', { cancelled: true })).toBe(false)
    expect(collection.items.value[0].cancelled).toBeUndefined()
  })
})

describe('one failure is not hidden by another success', () => {
  it('keeps a mission error in view when a key movement then saves', async () => {
    calls.load = async () => ({ data: [{ id: 'x' }], version: 'v1' })
    const missions = useCollection('missions')
    const vehicles = useCollection('vehicles')
    await missions.init()
    await vehicles.init()
    calls.update = async entity => {
      if (entity === 'missions') throw new ApiError('unreachable')
      return answer({ id: 'x', holder: 'Favre' })
    }
    await missions.update('x', { title: 'Lost' })
    await vehicles.mutate('x', vehicle => { vehicle.holder = 'Favre' })
    expect(sync.error.value?.key).toBe('errors.saveFailed')
  })
})

describe('catching up with other counters', () => {
  it('takes in what the server holds now', async () => {
    let version = 'v1'
    calls.load = async () => ({ data: [{ id: 'a', holder: version === 'v1' ? null : 'Favre' }], version })
    const collection = useCollection('vehicles')
    await collection.init()
    version = 'v2'
    await collection.refresh()
    expect(collection.items.value[0].holder).toBe('Favre')
  })

  it('leaves the list alone while a change is being saved', async () => {
    let release
    calls.load = async () => ({ data: [{ id: 'a', name: 'server' }], version: 'v1' })
    calls.update = (_entity, _id, item) => new Promise(resolve => { release = () => resolve(answer(item)) })
    const collection = useCollection('vehicles')
    await collection.init()
    calls.load = async () => ({ data: [{ id: 'a', name: 'elsewhere' }], version: 'v7' })
    const saving = collection.update('a', { name: 'mine' })
    await collection.refresh()
    expect(collection.items.value[0].name).toBe('mine')
    release()
    expect(await saving).toBe(true)
  })
})
