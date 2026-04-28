import express from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const PORT = process.env.PORT ?? 3000

const app = express()
app.use(express.json({ limit: '10mb' }))

// CORS pour le dev (Vite tourne sur un port différent)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── Mutex par entité ──
// Node.js est mono-thread : ce mutex async suffit pour gérer la concurrence
// entre requêtes simultanées sur la même entité.
const locks = new Map()

async function withLock(key, fn) {
  while (locks.has(key)) await locks.get(key)
  let resolve
  locks.set(key, new Promise(r => (resolve = r)))
  try {
    return await fn()
  } finally {
    locks.delete(key)
    resolve()
  }
}

// ── Lecture / écriture atomique ──

async function readEntity(entity) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${entity}.json`), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeEntity(entity, data) {
  const target = path.join(DATA_DIR, `${entity}.json`)
  const tmp = `${target}.tmp`
  // Écriture dans un fichier temporaire puis renommage atomique
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, target)
}

// ── Routes API ──

for (const entity of ['persons', 'vehicles', 'missions']) {
  app.get(`/api/${entity}`, async (_req, res) => {
    res.json(await readEntity(entity))
  })

  app.put(`/api/${entity}`, async (req, res) => {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'array expected' })
    }
    await withLock(entity, () => writeEntity(entity, req.body))
    res.json({ ok: true })
  })
}

// ── Servir le frontend en production ──
app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

async function start() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`))
}

start().catch(console.error)
