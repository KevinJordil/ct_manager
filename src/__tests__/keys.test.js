import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  keyIsOut, holderName, makeHolder, pushHistory,
  vehiclesWithKeyIn, vehiclesWithKeyOut, keysHeldBy,
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

describe('the vehicles store', () => {
  let store

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.resetModules()
    const { useVehiclesStore } = await import('../stores/vehicles.js')
    store = useVehiclesStore()
    // The store saves through the collection; here only the local state matters.
    store.vehicles.push({ id: 'v1', name: 'Duro', keyHolder: null, keyHistory: [] })
  })

  const vehicle = () => store.vehicles.find(v => v.id === 'v1')

  it('records who took the key', () => {
    store.takeKey('v1', { personId: 'p1', name: 'Sgt Favre', recordedBy: 'admin' })
    expect(vehicle().keyHolder).toMatchObject({ personId: 'p1', name: 'Sgt Favre', recordedBy: 'admin' })
    expect(vehicle().keyHistory).toHaveLength(1)
    expect(vehicle().keyHistory[0]).toMatchObject({ action: 'taken', name: 'Sgt Favre', from: '' })
  })

  it('records a transfer, naming the previous holder', () => {
    store.takeKey('v1', { personId: 'p1', name: 'Sgt Favre' })
    store.takeKey('v1', { personId: 'p2', name: 'Sdt Bernasconi', recordedBy: 'favre' })
    expect(vehicle().keyHolder.personId).toBe('p2')
    expect(vehicle().keyHistory).toHaveLength(2)
    expect(vehicle().keyHistory[1]).toMatchObject({
      action: 'transferred', from: 'Sgt Favre', name: 'Sdt Bernasconi',
    })
  })

  it('lends a key to somebody outside the application', () => {
    store.takeKey('v1', { personId: null, name: 'Garage Dupont' })
    expect(vehicle().keyHolder).toMatchObject({ personId: null, name: 'Garage Dupont' })
  })

  it('puts the key back on the board', () => {
    store.takeKey('v1', { personId: 'p1', name: 'Sgt Favre' })
    store.returnKey('v1', { recordedBy: 'bernasconi' })
    expect(vehicle().keyHolder).toBe(null)
    expect(vehicle().keyHistory.at(-1)).toMatchObject({
      action: 'returned', name: 'Sgt Favre', recordedBy: 'bernasconi',
    })
  })

  it('ignores a return on a key already on the board', () => {
    store.returnKey('v1')
    expect(vehicle().keyHolder).toBe(null)
    expect(vehicle().keyHistory).toEqual([])
  })

  it('keeps the key out when the holder is deleted, under their name', () => {
    store.takeKey('v1', { personId: 'p1', name: 'Sgt Favre' })
    store.forgetPersonKeys('p1')
    expect(vehicle().keyHolder).toMatchObject({ personId: null, name: 'Sgt Favre' })
  })

  it('leaves other holders alone when a person is deleted', () => {
    store.takeKey('v1', { personId: 'p2', name: 'Sdt Bernasconi' })
    store.forgetPersonKeys('p1')
    expect(vehicle().keyHolder.personId).toBe('p2')
  })
})
