import express from 'express'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ENTITES, valideCollection } from './validation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data')
const DIST_DIR = path.join(__dirname, 'dist')
const SEED_DIR = process.env.SEED_DIR ?? path.join(__dirname, 'data.example')
const PORT = process.env.PORT ?? 3000
const TOKEN = process.env.CT_TOKEN ?? ''
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? ''

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' }))

// ── CORS ──
// En développement, Vite proxifie /api vers ce serveur : les requêtes sont
// donc déjà de même origine et aucun en-tête CORS n'est nécessaire. On
// n'ouvre l'API à une autre origine que si CORS_ORIGIN est explicitement
// défini — jamais avec un joker, qui exposerait l'API à tout le web.
if (CORS_ORIGIN) {
  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', CORS_ORIGIN)
    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match')
    res.header('Access-Control-Expose-Headers', 'ETag')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

// ── Authentification ──
// Optionnelle : sans CT_TOKEN, l'API est ouverte (usage local). Dès que
// l'application est exposée sur un réseau, ce jeton est indispensable —
// un PUT non authentifié remplace l'intégralité d'une collection.

function comparaisonConstante(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

app.use('/api', (req, res, next) => {
  if (!TOKEN) return next()
  const entete = req.get('Authorization') ?? ''
  const fourni = entete.startsWith('Bearer ') ? entete.slice(7) : ''
  if (!fourni || !comparaisonConstante(fourni, TOKEN)) {
    return res.status(401).json({ error: 'Clé d\'accès requise ou invalide' })
  }
  next()
})

// ── Mutex par entité ──
// Node.js est mono-thread : ce mutex async suffit pour sérialiser les
// requêtes simultanées sur la même entité.
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

// ── Lecture / écriture ──

function versionDe(contenu) {
  return crypto.createHash('sha1').update(contenu).digest('hex').slice(0, 16)
}

function fichierDe(entity) {
  return path.join(DATA_DIR, `${entity}.json`)
}

async function lireBrut(entity) {
  try {
    return await fs.readFile(fichierDe(entity), 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return '[]'
    throw err
  }
}

async function ecrire(entity, contenu) {
  const cible = fichierDe(entity)
  const tmp = `${cible}.${process.pid}.tmp`
  // Écriture dans un fichier temporaire puis renommage atomique : une panne
  // en cours d'écriture ne peut pas laisser un JSON tronqué à la place des
  // données.
  await fs.writeFile(tmp, contenu, 'utf-8')
  await fs.rename(tmp, cible)
}

// ── Routes API ──

for (const entity of ENTITES) {
  app.get(`/api/${entity}`, async (_req, res, next) => {
    try {
      const brut = await lireBrut(entity)
      // La version permet au client de détecter qu'un autre onglet a modifié
      // les données depuis son dernier chargement.
      res.set('ETag', `"${versionDe(brut)}"`)
      res.type('application/json').send(brut)
    } catch (err) {
      next(err)
    }
  })

  app.put(`/api/${entity}`, async (req, res, next) => {
    const erreur = valideCollection(entity, req.body)
    if (erreur) return res.status(400).json({ error: erreur })

    try {
      await withLock(entity, async () => {
        const actuel = versionDe(await lireBrut(entity))
        const attendu = (req.get('If-Match') ?? '').replace(/"/g, '')

        // Écriture aveugle refusée : un client qui n'a pas lu les données
        // en cours écraserait le travail d'un autre onglet — ou remplacerait
        // le fichier par une collection vide après un échec de chargement.
        if (!attendu) {
          return res.status(428).json({
            error: 'En-tête If-Match requis',
            version: actuel,
          })
        }
        if (attendu !== '*' && attendu !== actuel) {
          return res.status(409).json({
            error: 'Les données ont été modifiées ailleurs depuis votre chargement',
            version: actuel,
          })
        }

        const contenu = JSON.stringify(req.body, null, 2)
        await ecrire(entity, contenu)
        const nouvelle = versionDe(contenu)
        res.set('ETag', `"${nouvelle}"`)
        res.json({ ok: true, version: nouvelle })
      })
    } catch (err) {
      next(err)
    }
  })
}

// Une route /api inconnue doit répondre en JSON, pas renvoyer l'application.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }))

// ── Frontend en production ──

app.use(express.static(DIST_DIR))
app.get('*', async (_req, res) => {
  const index = path.join(DIST_DIR, 'index.html')
  try {
    await fs.access(index)
  } catch {
    return res.status(503).type('text/plain').send(
      'Frontend non compilé. Lancez `npm run build`, ou `npm run dev` pour le mode développement.'
    )
  }
  res.sendFile(index)
})

// ── Gestion d'erreurs ──

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  if (res.headersSent) return
  const statut = err.type === 'entity.too.large' ? 413
    : err instanceof SyntaxError ? 400
    : 500
  res.status(statut).json({ error: statut === 500 ? 'Erreur interne' : err.message })
})

/**
 * Au premier lancement, recopie les données de démonstration.
 * Une collection déjà présente n'est jamais écrasée.
 */
async function amorcerDonnees() {
  for (const entity of ENTITES) {
    const cible = fichierDe(entity)
    try {
      await fs.access(cible)
      continue // déjà présent
    } catch { /* à amorcer */ }
    try {
      await fs.copyFile(path.join(SEED_DIR, `${entity}.json`), cible)
      console.log(`Données de démonstration chargées : ${entity}`)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err // pas de seed disponible : collection vide
    }
  }
}

async function start() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await amorcerDonnees()
  app.listen(PORT, () => {
    console.log(`Server → http://localhost:${PORT}`)
    if (!TOKEN) {
      console.warn('⚠  CT_TOKEN non défini : l\'API est accessible sans authentification.')
      console.warn('   Définissez CT_TOKEN avant toute exposition sur un réseau.')
    }
  })
}

start().catch(err => {
  console.error('[server] démarrage impossible :', err)
  process.exit(1)
})
