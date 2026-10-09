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
    await collection.add({ lastName: 'X' })
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
    const first = await collection.add({ lastName: 'A' })
    const second = await collection.add({ lastName: 'B' })
    expect(first.id).not.toBe(second.id)
    expect(collection.items.value).toHaveLength(2)
  })

  it('shows a change at once, before the server answers', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const pending = collection.add({ lastName: 'A' })
    expect(collection.items.value).toHaveLength(1)
    await pending
  })

  it('updates without letting the identifier be rewritten', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = await collection.add({ lastName: 'A' })
    await collection.update(item.id, { lastName: 'B', id: 'spoofed' })
    expect(collection.items.value[0]).toMatchObject({ id: item.id, lastName: 'B' })
  })

  it('ignores an update to a missing item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.update('ghost', { lastName: 'X' })).toBe(false)
    expect(collection.items.value).toEqual([])
  })

  it('removes an item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = await collection.add({ lastName: 'A' })
    await collection.remove(item.id)
    expect(collection.items.value).toEqual([])
  })

  it('mutate applies the change to the target item', async () => {
    const collection = useCollection('persons')
    await collection.init()
    const item = await collection.add({ lastName: 'A' })
    await collection.mutate(item.id, person => { person.lastName = 'Changed' })
    expect(collection.items.value[0].lastName).toBe('Changed')
  })

  it('takes back an addition the server refused', async () => {
    const collection = useCollection('persons')
    await collection.init()
    calls.save = async () => { throw new ApiError('unreachable') }
    expect(await collection.add({ lastName: 'A' })).toBeNull()
    expect(collection.items.value).toEqual([])
  })
})

describe('somebody else saved in between', () => {
  const conflict = () => new ApiError('conflict', { status: 409, code: 'conflict', params: { version: 'v9' } })

  it('never writes stale data under the newer version', async () => {
    // Another counter recorded a key on v1 while this one was still on v0.
    let server = { data: [{ id: 'v1', holder: null }, { id: 'v2', holder: null }], version: 'v0' }
    calls.load = async () => structuredClone(server)
    const collection = useCollection('vehicles')
    await collection.init()
    server = { data: [{ id: 'v1', holder: 'Favre' }, { id: 'v2', holder: null }], version: 'v1' }

    const sent = []
    calls.save = async (_entity, data, version) => {
      sent.push({ data: JSON.parse(JSON.stringify(data)), version })
      if (version !== server.version) throw conflict()
      server = { data: JSON.parse(JSON.stringify(data)), version: `${version}+` }
      return { version: server.version }
    }

    expect(await collection.mutate('v2', vehicle => { vehicle.holder = 'Rossier' })).toBe(true)
    // Replayed once on what the server holds: both movements survive.
    expect(sent.at(-1).version).toBe('v1')
    expect(server.data).toEqual([{ id: 'v1', holder: 'Favre' }, { id: 'v2', holder: 'Rossier' }])
    expect(collection.items.value).toEqual(server.data)
  })

  it('does not replay a mission, which the other change may have invalidated', async () => {
    let loads = 0
    calls.load = async () => ({ data: [{ id: 'm', title: loads++ ? 'Theirs' : 'Mine' }], version: `v${loads}` })
    let saves = 0
    calls.save = async () => { saves++; throw conflict() }
    const collection = useCollection('missions', data => data, { replay: false })
    await collection.init()

    expect(await collection.update('m', { title: 'Edited' })).toBe(false)
    expect(saves).toBe(1)
    // What is shown is now the server's, and the user is told.
    expect(collection.items.value).toEqual([{ id: 'm', title: 'Theirs' }])
    expect(sync.error.value.key).toBe('errors.conflict')
  })

  it('keeps the conflict in view when the next save on the same data also fails', async () => {
    calls.save = async () => { throw conflict() }
    const collection = useCollection('persons')
    await collection.init()
    expect(await collection.add({ lastName: 'A' })).toBeNull()
    expect(sync.conflict.value).toBe(true)
  })
})

describe('replaying after somebody else saved', () => {
  const conflict = () => new ApiError('conflict', { status: 409, code: 'conflict', params: {} })
  const mission = (id, day, over = {}) => ({ id, title: id, startDate: `2026-10-${day}T08:00`, endDate: `2026-10-${day}T17:00`, ...over })
  const replayIf = ({ attempted, changed }) => !changed.some(other =>
    other.startDate < attempted.endDate && attempted.startDate < other.endDate)

  /** The server holds `theirs` and answers a conflict to the first save. */
  function serverWith(ours, theirs) {
    let loads = 0
    let saves = 0
    calls.load = async () => ({ data: JSON.parse(JSON.stringify(loads++ ? theirs : ours)), version: `v${loads}` })
    calls.save = async () => { if (saves++ === 0) throw conflict(); return { version: 'v9' } }
    return { saves: () => saves }
  }

  it('replays a mission when the other change was on another day', async () => {
    const server = serverWith([mission('a', '10'), mission('b', '20')], [mission('a', '10'), mission('b', '20', { title: 'moved' })])
    const collection = useCollection('missions', data => data, { replayIf })
    await collection.init()
    expect(await collection.update('a', { title: 'mine' })).toBe(true)
    expect(server.saves()).toBe(2)
    expect(collection.items.value.find(m => m.id === 'b').title).toBe('moved')
  })

  it('does not replay it when the other change shares its dates', async () => {
    serverWith([mission('a', '10'), mission('b', '20')], [mission('a', '10'), mission('b', '10')])
    const collection = useCollection('missions', data => data, { replayIf })
    await collection.init()
    expect(await collection.update('a', { title: 'mine' })).toBe(false)
    expect(sync.error.value.key).toBe('errors.conflict')
  })

  it('never writes over a record the other person changed too', async () => {
    const server = serverWith([{ id: 'v', seats: 4 }], [{ id: 'v', seats: 9 }])
    const collection = useCollection('vehicles')
    await collection.init()
    expect(await collection.update('v', { name: 'mine' })).toBe(false)
    expect(server.saves()).toBe(1)
    expect(collection.items.value[0]).toEqual({ id: 'v', seats: 9 })
  })
})

describe('one failure is not hidden by another success', () => {
  it('keeps a mission error in view when a key movement then saves', async () => {
    const missions = useCollection('missions')
    const vehicles = useCollection('vehicles')
    calls.load = async () => ({ data: [{ id: 'x' }], version: 'v1' })
    await missions.init()
    await vehicles.init()

    calls.save = async entity => {
      if (entity === 'missions') throw new ApiError('unreachable')
      return { version: 'v2' }
    }
    await missions.update('x', { title: 'Lost' })
    await vehicles.mutate('x', vehicle => { vehicle.holder = 'Favre' })
    expect(sync.error.value?.key).toBe('errors.saveFailed')
  })
})

describe('rejected resource deletion', () => {
  it('restores the record and reports the actual blocker rather than a version conflict', async () => {
    calls.load = async () => ({ data: [{ id: 'a', name: 'Duro' }], version: 'v1' })
    calls.save = async () => { throw new ApiError('blocked', { status: 409, code: 'deletion.keys', params: { vehicles: 'M1' } }) }
    const collection = useCollection('vehicles')
    await collection.init()
    expect(await collection.remove('a')).toBe(false)
    expect(collection.items.value).toEqual([{ id: 'a', name: 'Duro' }])
    expect(sync.error.value.key).toBe('server.deletion.keys')
    expect(sync.conflict.value).toBe(false)
  })
  it('restores a mission if cancellation fails to save', async () => {
    calls.load = async () => ({ data: [{ id: 'a', title: 'Transport' }], version: 'v1' })
    calls.save = async () => { throw new ApiError('unreachable') }
    const collection = useCollection('missions')
    await collection.init()
    expect(await collection.update('a', { cancelled: true })).toBe(false)
    expect(collection.items.value[0].cancelled).toBeUndefined()
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
    calls.save = () => new Promise(resolve => { release = () => resolve({ version: 'v2' }) })
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
