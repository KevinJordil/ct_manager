import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4500 + Math.floor(Math.random() * 200)
const BASE = `http://127.0.0.1:${PORT}`

let serveur
let dataDir

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-manager-seed-'))
  serveur = spawn('node', ['server.js'], {
    cwd: RACINE,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: 'ignore',
  })
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${BASE}/api/persons`); break }
    catch { await new Promise(r => setTimeout(r, 100)) }
  }
}, 30000)

afterAll(async () => {
  serveur?.kill()
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true })
})

describe('demonstration data seeding', () => {
  it('fills an empty data directory on first launch', async () => {
    const persons = await (await fetch(`${BASE}/api/persons`)).json()
    const vehicles = await (await fetch(`${BASE}/api/vehicles`)).json()
    const missions = await (await fetch(`${BASE}/api/missions`)).json()
    expect(persons.length).toBeGreaterThan(0)
    expect(vehicles.length).toBeGreaterThan(0)
    expect(missions.length).toBeGreaterThan(0)
  })

  it('writes the files into the data directory', async () => {
    const fichiers = await fs.readdir(dataDir)
    expect(fichiers.sort()).toEqual(['missions.json', 'persons.json', 'vehicles.json'])
  })

  it('produces data the server validation accepts', async () => {
    const { validateCollection } = await import('../validation.js')
    for (const entity of ['persons', 'vehicles', 'missions']) {
      const data = await (await fetch(`${BASE}/api/${entity}`)).json()
      expect(validateCollection(entity, data)).toBeNull()
    }
  })

  it('does not require a key when CT_TOKEN is unset', async () => {
    const res = await fetch(`${BASE}/api/persons`)
    expect(res.status).toBe(200)
  })

  it('re-anchors the dates so a mission is ongoing right after install', async () => {
    const missions = await (await fetch(`${BASE}/api/missions`)).json()
    const nowDate = new Date()
    const pad = n => String(n).padStart(2, '0')
    const now = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}` +
      `T${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`

    const ongoing = missions.filter(m => m.startDate <= now && now <= m.endDate)
    const completed = missions.filter(m => m.endDate < now)
    const planned = missions.filter(m => m.startDate > now)

    expect(ongoing.length).toBeGreaterThan(0)
    expect(completed.length).toBeGreaterThan(0)
    expect(planned.length).toBeGreaterThan(0)
  })
})
