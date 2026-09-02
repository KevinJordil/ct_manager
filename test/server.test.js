import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4173 + Math.floor(Math.random() * 200)
const TOKEN = 'jeton-de-test'
const BASE = `http://127.0.0.1:${PORT}`

let serveur
let dataDir

async function attendreLeServeur() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${BASE}/api/persons`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      return
    } catch {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  throw new Error('Le serveur n\'a pas démarré')
}

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-manager-test-'))
  // Seed pointé sur un dossier vide : ces tests partent de collections vierges.
  const seedVide = path.join(dataDir, 'seed-vide')
  await fs.mkdir(seedVide)
  serveur = spawn('node', ['server.js'], {
    cwd: RACINE,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, SEED_DIR: seedVide, CT_TOKEN: TOKEN },
    stdio: 'ignore',
  })
  await attendreLeServeur()
}, 30000)

afterAll(async () => {
  serveur?.kill()
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true })
})

const auth = { Authorization: `Bearer ${TOKEN}` }

function get(entity, headers = auth) {
  return fetch(`${BASE}/api/${entity}`, { headers })
}

function put(entity, data, { version = '*', headers = auth } = {}) {
  return fetch(`${BASE}/api/${entity}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json', ...(version === null ? {} : { 'If-Match': version }) },
    body: JSON.stringify(data),
  })
}

const person = (over = {}) => ({ id: 'p1', nom: 'Müller', prenom: 'Andreas', permis: ['930'], conges: [], indisponible: false, ...over })

describe('authentification', () => {
  it('refuse une requête sans clé', async () => {
    const res = await get('persons', {})
    expect(res.status).toBe(401)
  })

  it('refuse une clé erronée', async () => {
    const res = await get('persons', { Authorization: 'Bearer mauvais-jeton' })
    expect(res.status).toBe(401)
  })

  it('accepte la bonne clé', async () => {
    const res = await get('persons')
    expect(res.status).toBe(200)
  })
})

describe('lecture', () => {
  it('renvoie un tableau vide quand le fichier n\'existe pas', async () => {
    const res = await get('vehicles')
    expect(await res.json()).toEqual([])
  })

  it('expose une version via ETag', async () => {
    const res = await get('persons')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{16}"$/)
  })

  it('répond en JSON sur une route inconnue', async () => {
    const res = await fetch(`${BASE}/api/inconnu`, { headers: auth })
    expect(res.status).toBe(404)
    expect(await res.json()).toHaveProperty('error')
  })
})

describe('écriture', () => {
  it('enregistre puis relit les données', async () => {
    const res = await put('persons', [person()])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.version).toMatch(/^[0-9a-f]{16}$/)

    const relu = await (await get('persons')).json()
    expect(relu).toEqual([person()])
  })

  it('écrit un fichier JSON lisible sur le disque', async () => {
    await put('vehicles', [{ id: 'v1', nom: 'Duro', categorie: 'moyen', statut: 'libre', places: 8 }])
    const brut = await fs.readFile(path.join(dataDir, 'vehicles.json'), 'utf-8')
    expect(JSON.parse(brut)).toHaveLength(1)
    expect(brut).toContain('\n  ') // indenté, donc relisible à la main
  })

  it('ne laisse pas de fichier temporaire derrière lui', async () => {
    await put('persons', [person()])
    const fichiers = await fs.readdir(dataDir)
    expect(fichiers.filter(f => f.includes('.tmp'))).toEqual([])
  })
})

describe('validation', () => {
  it('refuse autre chose qu\'un tableau', async () => {
    const res = await put('persons', { id: 'p1' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/tableau/)
  })

  it('refuse un élément mal formé sans toucher aux données', async () => {
    await put('persons', [person()])
    const avant = await (await get('persons')).json()

    const res = await put('persons', [{ id: 'p2', nom: 42, prenom: 'X' }])
    expect(res.status).toBe(400)

    expect(await (await get('persons')).json()).toEqual(avant)
  })

  it('refuse les identifiants en double', async () => {
    const res = await put('persons', [person(), person()])
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/double/)
  })

  it('refuse un JSON invalide', async () => {
    const res = await fetch(`${BASE}/api/persons`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': '*' },
      body: '{ pas du json',
    })
    expect(res.status).toBe(400)
  })
})

describe('protection contre l\'écrasement concurrent', () => {
  it('exige un en-tête If-Match', async () => {
    const res = await put('missions', [], { version: null })
    expect(res.status).toBe(428)
  })

  it('accepte une écriture avec la version courante', async () => {
    const version = (await get('persons')).headers.get('ETag').replace(/"/g, '')
    const res = await put('persons', [person({ nom: 'Nouveau' })], { version })
    expect(res.status).toBe(200)
  })

  it('refuse une écriture fondée sur une version périmée', async () => {
    const perimee = (await get('persons')).headers.get('ETag').replace(/"/g, '')

    // Un autre onglet enregistre entre-temps.
    await put('persons', [person({ nom: 'ParUnAutre' })], { version: perimee })

    const res = await put('persons', [person({ nom: 'Ecrasement' })], { version: perimee })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/modifiées ailleurs/)
    expect(body.version).toMatch(/^[0-9a-f]{16}$/)

    // Les données du premier écrivain sont intactes.
    const relu = await (await get('persons')).json()
    expect(relu[0].nom).toBe('ParUnAutre')
  })

  it('renvoie une version qui change à chaque écriture', async () => {
    const v1 = (await put('missions', [{ id: 'm1', titre: 'A' }])).headers.get('ETag')
    const v2 = (await put('missions', [{ id: 'm1', titre: 'B' }], { version: v1.replace(/"/g, '') })).headers.get('ETag')
    expect(v1).not.toBe(v2)
  })
})
