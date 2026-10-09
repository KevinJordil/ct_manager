import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'

const port = 16000 + Math.floor(Math.random() * 10000)
const base = `http://127.0.0.1:${port}/api`
let directory, server, token
const holder = { personId: 'p1', name: 'Favre', since: '2026-10-09T08:00' }
const vehicle = { id: 'v1', name: 'Duro', plate: 'M1', keyHolder: holder, keyHistory: [{ id: 'take1', at: holder.since, action: 'taken', name: 'Favre' }] }
const mission = { id: 'm1', title: 'Transport', startDate: '2099-10-09T08:00', endDate: '2099-10-09T18:00', vehicles: [{ vehicleId: 'v1', driverId: 'p1' }], staffIds: [] }
async function request(url, { method = 'GET', data, version, session = token } = {}) {
  return fetch(`${base}/${url}`, { method, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(version ? { 'If-Match': version } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) })
}
const save = (entity, data) => request(entity, { method: 'PUT', data, version: '*' })
async function journal() { const res = await request('journal'); return { data: await res.json(), version: res.headers.get('ETag') } }
const archive = (version, name = 'Cours octobre') => request('journal/archives', { method: 'POST', data: { name }, version })
async function start() {
  server = spawn('node', ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: directory, SEED_DIR: path.join(directory, 'empty'), CT_PASSWORD: 'test-password' }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { await request('auth/check'); break } catch { await new Promise(r => setTimeout(r, 50)) }
  }
  const login = await request('auth/login', { method: 'POST', session: '', data: { username: 'admin', password: 'test-password' } })
  token = (await login.json()).token
}
async function stop() { const exited = once(server, 'exit'); server.kill(); await exited }
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-journal-'))
  await fs.mkdir(path.join(directory, 'empty'))
  await fs.writeFile(path.join(directory, 'vehicles.json'), JSON.stringify([vehicle]))
  await fs.writeFile(path.join(directory, 'persons.json'), JSON.stringify([{ id: 'p1', lastName: 'Favre' }]))
  await fs.writeFile(path.join(directory, 'missions.json'), JSON.stringify([mission]))
  await start()
}, 30000)
afterAll(async () => { if (server && server.exitCode === null) await stop(); await fs.rm(directory, { recursive: true, force: true }) })

describe('journal API lifecycle', () => {
  it('protects deletion, migrates, archives, exports readable snapshots and persists across restart', async () => {
    const initial = await journal()
    expect(initial.data.entries).toHaveLength(1)
    expect((await request('journal', { session: '' })).status).toBe(401)
    expect((await archive(initial.version)).status).toBe(409)
    for (const entity of ['persons', 'vehicles']) {
      const denied = await save(entity, [])
      expect(denied.status).toBe(409)
      expect((await denied.json()).code).toBe('deletion.keys')
    }
    // Removing a holder must not delete the attached account before the guard.
    expect((await request('persons/p1/account', { method: 'PUT', data: { password: 'secret-password', lastName: 'Favre' } })).status).toBe(201)
    const returned = { ...vehicle, keyHolder: null, keyHistory: [
      { ...vehicle.keyHistory[0], closedBy: 'return1' },
      { id: 'return1', at: holder.since, action: 'returned', name: 'Favre', closes: 'take1' },
    ] }
    expect((await save('vehicles', [returned])).status).toBe(200)
    for (const entity of ['persons', 'vehicles']) {
      const denied = await save(entity, [])
      expect((await denied.json()).code).toBe('deletion.missions')
    }
    expect((await save('missions', [{ ...mission, cancelled: true }])).status).toBe(200)
    expect((await save('persons', [])).status).toBe(200)
    expect(await (await request('persons/accounts')).json()).toEqual([])
    // The past mission still names its driver, as they were when deleted.
    const afterPerson = (await (await request('missions')).json())[0]
    expect(afterPerson.vehicles[0].driverId).toBe('p1')
    expect(afterPerson.retiredPersons.p1).toMatchObject({ lastName: 'Favre' })
    expect((await archive(initial.version)).status).toBe(409)
    const current = await journal()
    expect(current.data.entries).toHaveLength(2)
    expect((await archive(current.version, ' ')).status).toBe(400)
    expect((await request('users', { method: 'POST', data: { username: 'reader', password: 'reader-password' } })).status).toBe(201)
    const reader = await (await request('auth/login', { method: 'POST', session: '', data: { username: 'reader', password: 'reader-password' } })).json()
    expect((await request('journal/archives', { method: 'POST', session: reader.token, version: current.version, data: { name: 'Denied' } })).status).toBe(403)
    expect((await archive(current.version)).status).toBe(200)
    expect((await archive(current.version)).status).toBe(409)
    // Saving a vehicle containing its older history must leave the new journal empty.
    expect((await save('vehicles', [{ ...returned, plate: 'M2' }])).status).toBe(200)
    expect((await journal()).data.entries).toEqual([])
    // A new course gets only new movements, and those survive deletion as well.
    const next = { ...returned, plate: 'M2', keyHistory: [
      ...returned.keyHistory,
      { id: 'take2', at: '2026-10-09T09:00', action: 'taken', name: 'Garage', closedBy: 'return2' },
      { id: 'return2', at: '2026-10-09T10:00', action: 'returned', name: 'Garage', closes: 'take2' },
    ] }
    expect((await save('vehicles', [next])).status).toBe(200)
    expect((await save('vehicles', [])).status).toBe(200)
    expect((await (await request('missions')).json())[0]).toMatchObject({
      id: 'm1', cancelled: true, vehicles: [{ vehicleId: 'v1' }], retiredVehicles: { v1: { plate: 'M2', name: 'Duro' } },
    })
    const final = (await journal()).data
    expect(final.entries.map(e => e.id).sort()).toEqual(['return2', 'take2'])
    expect(final.archives).toHaveLength(1)
    expect(final.archives[0].entries).toHaveLength(2)
    expect(final.archives[0].entries[0].vehiclePlate).toBe('M1')
    await stop()
    await start()
    expect((await journal()).data).toEqual(final)
    // A partially written transaction is completed before any request is served.
    await stop()
    await fs.writeFile(path.join(directory, 'resource-transaction.json'), JSON.stringify({ vehicles: JSON.stringify([returned]), journal: JSON.stringify(final) }))
    await start()
    expect(await (await request('vehicles')).json()).toEqual([returned])
    expect((await journal()).data).toEqual(final)
    await expect(fs.access(path.join(directory, 'resource-transaction.json'))).rejects.toThrow()
  }, 30000)
})
