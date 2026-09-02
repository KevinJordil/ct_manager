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

describe('amorçage des données de démonstration', () => {
  it('remplit un dossier de données vide au premier lancement', async () => {
    const persons = await (await fetch(`${BASE}/api/persons`)).json()
    const vehicles = await (await fetch(`${BASE}/api/vehicles`)).json()
    const missions = await (await fetch(`${BASE}/api/missions`)).json()
    expect(persons.length).toBeGreaterThan(0)
    expect(vehicles.length).toBeGreaterThan(0)
    expect(missions.length).toBeGreaterThan(0)
  })

  it('écrit les fichiers dans le dossier de données', async () => {
    const fichiers = await fs.readdir(dataDir)
    expect(fichiers.sort()).toEqual(['missions.json', 'persons.json', 'vehicles.json'])
  })

  it('produit des données conformes à la validation du serveur', async () => {
    const { valideCollection } = await import('../validation.js')
    for (const entity of ['persons', 'vehicles', 'missions']) {
      const data = await (await fetch(`${BASE}/api/${entity}`)).json()
      expect(valideCollection(entity, data)).toBeNull()
    }
  })

  it('n\'exige pas de clé quand CT_TOKEN n\'est pas défini', async () => {
    const res = await fetch(`${BASE}/api/persons`)
    expect(res.status).toBe(200)
  })

  it('recale les dates pour qu\'une mission soit en cours dès l\'installation', async () => {
    const missions = await (await fetch(`${BASE}/api/missions`)).json()
    const maintenant = new Date()
    const pad = n => String(n).padStart(2, '0')
    const now = `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}` +
      `T${pad(maintenant.getHours())}:${pad(maintenant.getMinutes())}`

    const enCours = missions.filter(m => m.dateDebut <= now && now <= m.dateFin)
    const passees = missions.filter(m => m.dateFin < now)
    const aVenir = missions.filter(m => m.dateDebut > now)

    expect(enCours.length).toBeGreaterThan(0)
    expect(passees.length).toBeGreaterThan(0)
    expect(aVenir.length).toBeGreaterThan(0)
  })
})
