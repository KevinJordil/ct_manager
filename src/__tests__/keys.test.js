import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  keyIsOut, holderName, makeHolder, pushHistory, recorderName, keyMovements,
  openHolding, keysNotReturned, vehiclesWithKeyIn, vehiclesWithKeyOut, keysHeldBy, moveKey,
} from '../keys.js'
import { KEY_HISTORY_LIMIT } from '../constants.js'

const persons = [
  { id: 'p1', rank: 'Sgt', firstName: 'Caroline', lastName: 'Favre' },
  { id: 'p2', rank: 'Sdt', firstName: 'Luca', lastName: 'Bernasconi' },
]

const held = (name, personId = 'p1') => ({
  id: 'v1', name: 'Duro',
  keyHolder: { personId, name, since: '2026-09-02T07:15', recordedBy: 'admin' },
})

describe('key holders', () => {
  it('tells a key on the board from a key that is out', () => {
    expect(keyIsOut({ id: 'v1', keyHolder: null })).toBe(false)
    expect(keyIsOut(held('Sgt Caroline Favre'))).toBe(true)
    expect(keyIsOut(undefined)).toBe(false)
  })

  it('reads the name from the person record, so a rename follows', () => {
    const vehicle = held('Sgt Caroline Ancien')
    expect(holderName(vehicle.keyHolder, persons)).toBe('Sgt Caroline Favre')
  })

  it('keeps the recorded name for somebody outside the application', () => {
    const vehicle = held('Garage Dupont', null)
    expect(holderName(vehicle.keyHolder, persons)).toBe('Garage Dupont')
  })

  it('falls back on the recorded name when the person is gone', () => {
    const vehicle = held('Sgt Caroline Favre', 'deleted')
    expect(holderName(vehicle.keyHolder, persons)).toBe('Sgt Caroline Favre')
  })

  it('stores an empty id rather than an empty string for an outsider', () => {
    const holder = makeHolder({ personId: '', name: '  Garage Dupont ' }, '2026-09-02T07:15')
    expect(holder).toEqual({
      personId: null, name: 'Garage Dupont', since: '2026-09-02T07:15', recordedBy: '',
    })
  })
})

describe('key history', () => {
  it('keeps only the most recent movements', () => {
    const vehicle = { keyHistory: [] }
    for (let i = 0; i < KEY_HISTORY_LIMIT + 10; i++) pushHistory(vehicle, { id: `e${i}` })
    expect(vehicle.keyHistory).toHaveLength(KEY_HISTORY_LIMIT)
    expect(vehicle.keyHistory[0].id).toBe('e10')
    expect(vehicle.keyHistory.at(-1).id).toBe(`e${KEY_HISTORY_LIMIT + 9}`)
  })

  it('starts a history on a vehicle that never had one', () => {
    const vehicle = {}
    pushHistory(vehicle, { id: 'e1' })
    expect(vehicle.keyHistory).toEqual([{ id: 'e1' }])
  })
})

describe('the open holding', () => {
  it('is nothing at all on a vehicle whose key never moved', () => {
    expect(openHolding({})).toBe(null)
    expect(openHolding({ keyHistory: [] })).toBe(null)
  })

  it('is the movement that handed the key to whoever holds it', () => {
    const vehicle = { keyHistory: [
      { id: 'a', action: 'taken', name: 'A', closedBy: 'b' },
      { id: 'b', action: 'transferred', name: 'B' },
    ] }
    expect(openHolding(vehicle).id).toBe('b')
  })

  it('is nothing once the key is back on the board', () => {
    const vehicle = { keyHistory: [
      { id: 'a', action: 'taken', name: 'A', closedBy: 'b' },
      { id: 'b', action: 'returned', name: 'A' },
    ] }
    expect(openHolding(vehicle)).toBe(null)
  })
})

describe('the key board', () => {
  const fleet = [
    { id: 'v1', keyHolder: { personId: 'p1', name: 'A', since: '2026-09-01T08:00' } },
    { id: 'v2', keyHolder: null },
    { id: 'v3', keyHolder: { personId: null, name: 'Garage', since: '2026-09-02T09:00' } },
  ]

  it('separates the keys that are out from those on the board', () => {
    expect(vehiclesWithKeyIn(fleet).map(v => v.id)).toEqual(['v2'])
    expect(vehiclesWithKeyOut(fleet).map(v => v.id)).toEqual(['v3', 'v1'])
  })

  it('lists the keys a person is holding', () => {
    expect(keysHeldBy('p1', fleet).map(v => v.id)).toEqual(['v1'])
    expect(keysHeldBy('p2', fleet)).toEqual([])
  })
})

describe('naming the account that records a movement', () => {
  it('uses the person behind the account', () => {
    expect(recorderName({ username: 'favre', personId: 'p1' }, persons)).toBe('Sgt Caroline Favre')
  })

  it('falls back on the username for an account tied to nobody', () => {
    expect(recorderName({ username: 'admin', personId: null }, persons)).toBe('admin')
    expect(recorderName({ username: 'admin', personId: 'gone' }, persons)).toBe('admin')
  })

  it('has nothing to say about no account at all', () => {
    expect(recorderName(null, persons)).toBe('')
  })
})

describe('the fleet-wide log', () => {
  const fleet = [
    {
      id: 'v1', name: 'Duro', plate: 'M1', category: 'heavy',
      keyHistory: [
        { id: 'a', at: '2026-09-02T07:15', action: 'taken', name: 'Sgt Favre', recordedBy: 'Sgt Favre' },
        { id: 'b', at: '2026-09-03T16:40', action: 'returned', name: 'Sgt Favre', recordedBy: 'Sdt Jacquemoud' },
      ],
    },
    {
      id: 'v2', name: 'Class G', plate: 'M2',
      keyHistory: [{ id: 'c', at: '2026-09-03T08:00', action: 'taken', name: 'Garage', recordedBy: 'admin' }],
    },
    { id: 'v3', name: 'Mégane', plate: 'M3' },
  ]

  it('merges every vehicle, most recent first', () => {
    expect(keyMovements(fleet).map(m => m.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps two movements of the same minute in the order they happened', () => {
    // A key passed on and hung up within the same minute: the log must not
    // claim the vehicle was taken after it came back.
    const at = '2026-09-04T09:14'
    const movements = keyMovements([{
      id: 'v9', name: 'Duro', plate: 'M9', category: 'heavy',
      keyHistory: [
        { id: 'first', at, action: 'transferred', name: 'B', from: 'A' },
        { id: 'second', at, action: 'returned', name: 'B' },
      ],
    }])
    expect(movements.map(m => m.id)).toEqual(['second', 'first'])
  })

  it('carries the vehicle, since the log reads across the fleet', () => {
    const [latest] = keyMovements(fleet)
    expect(latest).toMatchObject({
      vehicleId: 'v1', vehicleName: 'Duro', vehiclePlate: 'M1', vehicleCategory: 'heavy',
    })
  })

  it('leaves the category empty rather than absent when the vehicle has none', () => {
    const [movement] = keyMovements([{
      id: 'v9', name: 'X', plate: 'M9',
      keyHistory: [{ id: 'z', at: '2026-09-04T08:00', action: 'taken', name: 'A' }],
    }])
    expect(movement.vehicleCategory).toBe('')
  })

  it('flags a movement recorded by somebody other than the holder', () => {
    const byId = Object.fromEntries(keyMovements(fleet).map(m => [m.id, m]))
    expect(byId.b.byOther).toBe(true)   // Jacquemoud hung up Favre's key
    expect(byId.a.byOther).toBe(false)  // Favre took her own
  })

  it('copes with a vehicle that has no history at all', () => {
    expect(keyMovements([{ id: 'v3', name: 'X' }])).toEqual([])
    expect(keyMovements([])).toEqual([])
  })
})

describe('the keys nobody brought back', () => {
  const out = (id, since) => ({
    id, plate: `M${id}`, name: 'Duro', category: 'medium',
    keyHolder: { personId: 'p1', name: 'Sgt Favre', since },
  })

  it('lists only the keys that are out, longest out first', () => {
    const fleet = [
      out('v1', '2026-09-04T09:00'),
      { id: 'v2', plate: 'M2', keyHolder: null },
      out('v3', '2026-09-02T07:00'),
    ]
    expect(keysNotReturned(fleet).map(k => k.vehicleId)).toEqual(['v3', 'v1'])
  })

  it('carries what the board needs to name the vehicle and the holder', () => {
    const [key] = keysNotReturned([out('v1', '2026-09-04T09:00')])
    expect(key).toMatchObject({
      vehicleId: 'v1', plate: 'Mv1', model: 'Duro', category: 'medium',
      since: '2026-09-04T09:00',
    })
    expect(key.holder.name).toBe('Sgt Favre')
  })

  it('says nothing when every key is on the board', () => {
    expect(keysNotReturned([{ id: 'v1', keyHolder: null }, { id: 'v2' }])).toEqual([])
  })
})

describe('moving a key', () => {
  const at = '2026-10-09T08:00'
  let vehicle
  let counter
  beforeEach(() => {
    vehicle = { id: 'v1', name: 'Duro', keyHolder: null, keyHistory: [] }
    counter = 0
  })
  const move = (holder, recordedBy = 'admin') => moveKey(vehicle, { holder, recordedBy, at, id: `m${++counter}` })
  const favre = { personId: 'p1', name: 'Sgt Favre' }
  const bernasconi = { personId: 'p2', name: 'Sdt Bernasconi' }

  it('links a return to the movement that handed the key over', () => {
    move(favre); move(null)
    const [taken, returned] = vehicle.keyHistory
    expect(returned.closes).toBe(taken.id)
    expect(taken.closedBy).toBe(returned.id)
  })

  it('links both ends of a transfer, which closes one holding and opens another', () => {
    move(favre); move(bernasconi); move(null)
    const [taken, transferred, returned] = vehicle.keyHistory
    expect(taken.closedBy).toBe(transferred.id)
    expect(transferred.closes).toBe(taken.id)
    expect(transferred.closedBy).toBe(returned.id)
    expect(returned.closes).toBe(transferred.id)
    expect(taken.closes).toBe('')
  })

  it('leaves a holding still open unlinked at its far end', () => {
    move(favre)
    expect(vehicle.keyHistory[0].closedBy).toBeUndefined()
  })

  it('starts a fresh pair after the key came back', () => {
    move(favre); move(null); move(bernasconi); move(null)
    const [firstTake, firstReturn, secondTake, secondReturn] = vehicle.keyHistory
    expect(firstReturn.closes).toBe(firstTake.id)
    expect(secondReturn.closes).toBe(secondTake.id)
    expect(secondTake.closes).toBe('')
  })

  it('records who took the key, who recorded it and when', () => {
    move(favre)
    expect(vehicle.keyHolder).toMatchObject({ personId: 'p1', name: 'Sgt Favre', recordedBy: 'admin', since: at })
    expect(vehicle.keyHistory[0]).toMatchObject({ action: 'taken', name: 'Sgt Favre', from: '', at })
  })

  it('records a transfer, naming the previous holder', () => {
    move(favre); move(bernasconi, 'favre')
    expect(vehicle.keyHolder.personId).toBe('p2')
    expect(vehicle.keyHistory[1]).toMatchObject({ action: 'transferred', from: 'Sgt Favre', name: 'Sdt Bernasconi', recordedBy: 'favre' })
  })

  it('lends a key to somebody outside the application', () => {
    move({ personId: null, name: 'Garage Dupont' })
    expect(vehicle.keyHolder).toMatchObject({ personId: null, name: 'Garage Dupont' })
  })

  it('refuses a return when the key is already on the board', () => {
    expect(move(null)).toBe('alreadyIn')
    expect(vehicle.keyHistory).toEqual([])
  })

  it('refuses to hand the key to whoever holds it', () => {
    move(favre)
    expect(move(favre)).toBe('sameHolder')
    expect(vehicle.keyHistory).toHaveLength(1)
  })

  it('works on a vehicle written before keys were tracked', () => {
    const old = { id: 'v2', name: 'VW' }
    expect(moveKey(old, { holder: favre, recordedBy: 'a', at, id: 'x' })).toBeNull()
    expect(old.keyHistory).toHaveLength(1)
  })
})

describe('the vehicles store', () => {
  let store
  let calls

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.resetModules()
    calls = []
    // The server answers with the vehicle as it stored it.
    vi.doMock('../api.js', () => ({
      api: {
        load: async () => ({ data: [{ id: 'v1', name: 'Duro', keyHolder: null, keyHistory: [] }], version: 'v1' }),
        save: async () => ({ version: 'v2' }),
        moveKey: async (id, holder) => {
          calls.push({ id, holder })
          return { vehicle: { id, name: 'Duro', plate: 'M1', keyHolder: holder && { ...holder, since: 'now', recordedBy: 'server' }, keyHistory: [] }, version: 'v9', previous: 'v1' }
        },
      },
    }))
    const { useVehiclesStore } = await import('../stores/vehicles.js')
    store = useVehiclesStore()
    await store.init()
  })

  it('asks the server to move the key, and shows the vehicle it sends back', async () => {
    expect(await store.takeKey('v1', { personId: 'p1', name: 'Sgt Favre' })).toBe(true)
    expect(calls).toEqual([{ id: 'v1', holder: { personId: 'p1', name: 'Sgt Favre' } }])
    expect(store.vehicles[0].keyHolder).toMatchObject({ name: 'Sgt Favre', recordedBy: 'server' })
  })

  it('hangs the key up through the server too', async () => {
    await store.returnKey('v1')
    expect(calls.at(-1)).toEqual({ id: 'v1', holder: null })
  })
})
