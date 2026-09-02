import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4500 + Math.floor(Math.random() * 200)
const PASSWORD = 'seed-test-password'
const BASE = `http://127.0.0.1:${PORT}`

let server
let dataDir
let token

/** Every /api route below the login requires a session. */
function authorized(routePath) {
  return fetch(`${BASE}${routePath}`, { headers: { Authorization: `Bearer ${token}` } })
}

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-manager-seed-'))
  server = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, CT_PASSWORD: PASSWORD },
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`${BASE}/api/auth/check`)
      break
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  token = (await res.json()).token
}, 30000)

afterAll(async () => {
  server?.kill()
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true })
})

describe('demonstration data seeding', () => {
  it('fills an empty data directory on first launch', async () => {
    const persons = await (await authorized('/api/persons')).json()
    const vehicles = await (await authorized('/api/vehicles')).json()
    const missions = await (await authorized('/api/missions')).json()
    expect(persons.length).toBeGreaterThan(0)
    expect(vehicles.length).toBeGreaterThan(0)
    expect(missions.length).toBeGreaterThan(0)
  })

  it('writes the files into the data directory', async () => {
    const files = await fs.readdir(dataDir)
    expect(files).toEqual(expect.arrayContaining(['missions.json', 'persons.json', 'vehicles.json']))
  })

  it('produces data the server validation accepts', async () => {
    const { validateCollection } = await import('../validation.js')
    for (const entity of ['persons', 'vehicles', 'missions']) {
      const data = await (await authorized(`/api/${entity}`)).json()
      expect(validateCollection(entity, data)).toBeNull()
    }
  })

  it('protects the collections behind the login', async () => {
    expect((await fetch(`${BASE}/api/persons`)).status).toBe(401)
    expect((await authorized('/api/persons')).status).toBe(200)
  })

  it('re-anchors the dates so a mission is ongoing right after install', async () => {
    const missions = await (await authorized('/api/missions')).json()
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
