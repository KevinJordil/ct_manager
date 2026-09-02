import express from 'express'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  ENTITIES, validateCollection,
  validateRequestSubmission, sanitizeRequestSubmission, isValidRequestStatus,
  validateParkLayout, sanitizeParkLayout, decodeImageDataUrl, IMAGE_EXTENSIONS,
  validateConfig,
} from './validation.js'
import { withDefaults } from './src/config.js'
import { reanchor } from './seed.js'
import { createAuth, resolvePassword } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data')
const DIST_DIR = path.join(__dirname, 'dist')
const SEED_DIR = process.env.SEED_DIR ?? path.join(__dirname, 'data.example')
const PORT = process.env.PORT ?? 3000
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? ''

const { password: ADMIN_PASSWORD, generated: PASSWORD_GENERATED } = resolvePassword()
const auth = createAuth({ password: ADMIN_PASSWORD })

const app = express()
app.disable('x-powered-by')
// The site plan travels as a data URL and is far larger than any collection,
// so it gets its own, wider limit.
app.use('/api/parc/image', express.json({ limit: '16mb' }))
app.use(express.json({ limit: '4mb' }))

/**
 * Errors travel as a machine-readable code plus parameters; the interface
 * renders them in the reader's language. `message` is an English fallback
 * for anyone calling the API directly.
 */
function fail(res, status, code, params = {}, message = code) {
  return res.status(status).json({ code, params, error: message })
}

// ── CORS ──
// In development Vite proxies /api to this server, so requests are already
// same-origin and need no CORS header. The API is opened to another origin
// only when CORS_ORIGIN is set explicitly — never with a wildcard, which
// would expose it to the whole web.
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

// ── Local timestamps ──
// Stored dates are naive local strings throughout the application; a request's
// creation time follows the same convention so it sorts and displays like the
// rest.

function localDateTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// ── Rate limiting for the public form ──
// The submission route is the only one open without a session: without a
// limit, anyone could grow the file indefinitely.

const MAX_STORED_REQUESTS = 2000
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX_PER_WINDOW = 5

const submissionsByClient = new Map() // client key → timestamps

function rateLimited(key, now = Date.now()) {
  const recent = (submissionsByClient.get(key) ?? []).filter(at => now - at < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_PER_WINDOW) {
    submissionsByClient.set(key, recent)
    return true
  }
  recent.push(now)
  submissionsByClient.set(key, recent)
  // Keep the map from growing without bound on a long-running server.
  if (submissionsByClient.size > 10_000) {
    for (const [client, times] of submissionsByClient) {
      if (!times.some(at => now - at < RATE_WINDOW_MS)) submissionsByClient.delete(client)
    }
  }
  return false
}

// ── Authentication ──
// Everything under /api is private except the few routes mounted before the
// guard below: the public request form needs to reach the API without an
// account.

app.post('/api/auth/login', (req, res) => {
  const session = auth.login(req.body?.password)
  if (!session) return fail(res, 401, 'auth.invalidPassword', {}, 'Wrong password')
  res.json({ token: session.token, expiresAt: session.expiresAt })
})

app.post('/api/auth/logout', (req, res) => {
  auth.logout(auth.tokenFrom(req))
  res.json({ ok: true })
})

app.get('/api/auth/check', auth.requireAuth, (_req, res) => res.json({ ok: true }))

/**
 * The configuration is readable without a session: the public request form
 * needs the list of vehicle types. Writing it requires one.
 */
app.get('/api/config', async (_req, res, next) => {
  try {
    const raw = await readRaw('config')
    res.json(withDefaults(raw === '[]' ? {} : JSON.parse(raw)))
  } catch (err) {
    next(err)
  }
})

/**
 * Public submission of a vehicle request. Deliberately the only write open
 * without a session, hence the rate limit, the size cap and the strict
 * validation.
 */
app.post('/api/requests', async (req, res, next) => {
  // The accepted vehicle types follow the configuration, so a type added by
  // an operator is not rejected here.
  let allowedTypes
  try {
    const raw = await readRaw('config')
    allowedTypes = withDefaults(raw === '[]' ? {} : JSON.parse(raw))
      .requestVehicleTypes.map(type => type.id)
  } catch (err) {
    return next(err)
  }

  const invalid = validateRequestSubmission(req.body, allowedTypes)
  if (invalid) {
    return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid request')
  }
  if (rateLimited(req.ip ?? 'unknown')) {
    return fail(res, 429, 'tooManyRequests', {}, 'Too many requests, try again later')
  }

  try {
    await withLock('requests', async () => {
      const stored = JSON.parse(await readRaw('requests'))
      if (stored.length >= MAX_STORED_REQUESTS) {
        return fail(res, 503, 'requestsFull', {}, 'The request queue is full')
      }
      const request = {
        id: crypto.randomUUID(),
        createdAt: localDateTime(),
        status: 'pending',
        ...sanitizeRequestSubmission(req.body),
      }
      await write('requests', JSON.stringify([...stored, request], null, 2))
      res.status(201).json({ ok: true, id: request.id })
    })
  } catch (err) {
    next(err)
  }
})

// Everything below this point requires a session.
app.use('/api', auth.requireAuth)

// ── Requests, management side ──

app.get('/api/requests', async (_req, res, next) => {
  try {
    res.type('application/json').send(await readRaw('requests'))
  } catch (err) {
    next(err)
  }
})

app.put('/api/requests/:id/status', async (req, res, next) => {
  const { status } = req.body ?? {}
  if (!isValidRequestStatus(status)) {
    return fail(res, 400, 'validation.unknownValue', { field: 'status' }, 'Unknown status')
  }
  try {
    await withLock('requests', async () => {
      const stored = JSON.parse(await readRaw('requests'))
      const index = stored.findIndex(request => request.id === req.params.id)
      if (index === -1) return fail(res, 404, 'notFound', {}, 'Unknown request')
      stored[index] = { ...stored[index], status }
      await write('requests', JSON.stringify(stored, null, 2))
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/requests/:id', async (req, res, next) => {
  try {
    await withLock('requests', async () => {
      const stored = JSON.parse(await readRaw('requests'))
      const remaining = stored.filter(request => request.id !== req.params.id)
      if (remaining.length === stored.length) {
        return fail(res, 404, 'notFound', {}, 'Unknown request')
      }
      await write('requests', JSON.stringify(remaining, null, 2))
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

// ── Per-entity mutex ──
// Node.js is single-threaded: this async mutex is enough to serialise
// concurrent requests on the same entity.
const locks = new Map()

async function withLock(key, fn) {
  while (locks.has(key)) await locks.get(key)
  let release
  locks.set(key, new Promise(r => (release = r)))
  try {
    return await fn()
  } finally {
    locks.delete(key)
    release()
  }
}

// ── Reading and writing ──

function versionOf(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 16)
}

function fileOf(entity) {
  return path.join(DATA_DIR, `${entity}.json`)
}

async function readRaw(entity) {
  try {
    return await fs.readFile(fileOf(entity), 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return '[]'
    throw err
  }
}

async function write(entity, content) {
  const target = fileOf(entity)
  const tmp = `${target}.${process.pid}.tmp`
  // Write to a temporary file then rename atomically: a crash mid-write
  // cannot leave truncated JSON in place of the data.
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, target)
}

// ── API routes ──

for (const entity of ENTITIES) {
  app.get(`/api/${entity}`, async (_req, res, next) => {
    try {
      const raw = await readRaw(entity)
      // The version lets a client detect that another tab changed the data
      // since it last loaded.
      res.set('ETag', `"${versionOf(raw)}"`)
      res.type('application/json').send(raw)
    } catch (err) {
      next(err)
    }
  })

  app.put(`/api/${entity}`, async (req, res, next) => {
    const invalid = validateCollection(entity, req.body)
    if (invalid) {
      return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid payload')
    }

    try {
      await withLock(entity, async () => {
        const current = versionOf(await readRaw(entity))
        const expected = (req.get('If-Match') ?? '').replace(/"/g, '')

        // Blind writes are refused: a client that has not read the current
        // data would overwrite another tab's work — or replace the file with
        // an empty collection after a failed load.
        if (!expected) {
          return fail(res, 428, 'preconditionRequired', { version: current },
            'If-Match header required')
        }
        if (expected !== '*' && expected !== current) {
          return fail(res, 409, 'conflict', { version: current },
            'Data was modified elsewhere since your load')
        }

        const content = JSON.stringify(req.body, null, 2)
        await write(entity, content)
        const version = versionOf(content)
        res.set('ETag', `"${version}"`)
        res.json({ ok: true, version })
      })
    } catch (err) {
      next(err)
    }
  })
}

// ── Configuration ──

app.put('/api/config', async (req, res, next) => {
  const invalid = validateConfig(req.body)
  if (invalid) {
    return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid configuration')
  }
  try {
    await withLock('config', async () => {
      await write('config', JSON.stringify(withDefaults(req.body), null, 2))
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

// ── Vehicle park ──
// The layout holds zones drawn over the site plan; the plan itself is a
// separate file, since a binary has no place inside a JSON collection.

const PARK_LAYOUT = 'parc'

function parkImagePath(extension) {
  return path.join(DATA_DIR, `parc-image.${extension}`)
}

/** @returns {{extension: string, path: string}|null} */
async function findParkImage() {
  for (const extension of IMAGE_EXTENSIONS) {
    const candidate = parkImagePath(extension)
    try {
      await fs.access(candidate)
      return { extension, path: candidate }
    } catch { /* try the next extension */ }
  }
  return null
}

async function removeParkImages() {
  for (const extension of IMAGE_EXTENSIONS) {
    try {
      await fs.unlink(parkImagePath(extension))
    } catch { /* nothing to remove */ }
  }
}

app.get('/api/parc', async (_req, res, next) => {
  try {
    const raw = await readRaw(PARK_LAYOUT)
    // readRaw defaults to an empty array; the layout is an object.
    res.type('application/json').send(raw === '[]' ? '{"hasImage":false,"zones":[],"colorLabels":{}}' : raw)
  } catch (err) {
    next(err)
  }
})

app.put('/api/parc', async (req, res, next) => {
  const invalid = validateParkLayout(req.body)
  if (invalid) {
    return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid layout')
  }
  try {
    await withLock(PARK_LAYOUT, async () => {
      await write(PARK_LAYOUT, JSON.stringify(sanitizeParkLayout(req.body), null, 2))
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

/**
 * The plan is served behind the session like everything else. The browser
 * therefore fetches it in JavaScript, since an <img> tag cannot carry an
 * Authorization header.
 */
app.get('/api/parc/image', async (_req, res, next) => {
  try {
    const found = await findParkImage()
    if (!found) return fail(res, 404, 'noImage', {}, 'No park image')
    res.type(found.extension === 'jpg' ? 'image/jpeg' : `image/${found.extension}`)
    res.set('Cache-Control', 'no-cache')
    res.send(await fs.readFile(found.path))
  } catch (err) {
    next(err)
  }
})

app.put('/api/parc/image', async (req, res, next) => {
  const decoded = decodeImageDataUrl(req.body?.image)
  if (decoded.code) return fail(res, 400, `validation.${decoded.code}`, decoded.params, 'Invalid image')
  try {
    await withLock('parc-image', async () => {
      // Only one plan at a time, whatever its format.
      await removeParkImages()
      await fs.writeFile(parkImagePath(decoded.extension), decoded.buffer)
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/parc/image', async (_req, res, next) => {
  try {
    await withLock('parc-image', async () => {
      await removeParkImages()
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

// An unknown /api route must answer in JSON, not serve the application.
app.use('/api', (_req, res) => fail(res, 404, 'notFound', {}, 'Unknown route'))

// ── Frontend in production ──

app.use(express.static(DIST_DIR))
app.get('*', async (_req, res) => {
  const index = path.join(DIST_DIR, 'index.html')
  try {
    await fs.access(index)
  } catch {
    return res.status(503).type('text/plain').send(
      'Frontend not built. Run `npm run build`, or `npm run dev` for development mode.'
    )
  }
  res.sendFile(index)
})

// ── Error handling ──

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  if (res.headersSent) return
  if (err.type === 'entity.too.large') return fail(res, 413, 'payloadTooLarge', {}, err.message)
  if (err instanceof SyntaxError) return fail(res, 400, 'malformedJson', {}, err.message)
  return fail(res, 500, 'internal', {}, 'Internal error')
})

/**
 * On first launch, installs the demonstration data. A collection that is
 * already present is never overwritten. Sample dates are re-anchored on the
 * current day (see seed.js), otherwise a later install would show nothing
 * but past missions.
 */
async function seedData() {
  const missing = []
  for (const entity of ENTITIES) {
    try {
      await fs.access(fileOf(entity))
    } catch {
      missing.push(entity)
    }
  }
  if (!missing.length) return

  const collections = {}
  for (const entity of missing) {
    try {
      collections[entity] = JSON.parse(await fs.readFile(path.join(SEED_DIR, `${entity}.json`), 'utf-8'))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err // no sample set: leave the collection empty
    }
  }
  if (!Object.keys(collections).length) return

  for (const [entity, data] of Object.entries(reanchor(collections))) {
    await write(entity, JSON.stringify(data, null, 2))
    console.log(`Demonstration data loaded: ${entity}`)
  }
}

async function start() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await seedData()
  app.listen(PORT, () => {
    console.log(`Server → http://localhost:${PORT}`)
    if (PASSWORD_GENERATED) {
      console.warn('   (the generated password above is valid until the next restart)')
    }
  })
}

start().catch(err => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})
