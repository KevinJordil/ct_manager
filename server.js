import { mergeJournal, deletionBlocker, rememberResources } from './journal.js'
import express from 'express'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  ENTITIES, validateCollection,
  validateRequestSubmission, sanitizeRequestSubmission, isValidRequestStatus,
  validateParkLayout, sanitizeParkLayout, decodeImageDataUrl, IMAGE_EXTENSIONS,
  validateConfig, unknownReference, isRealDate,
} from './validation.js'
import { withDefaults } from './src/config.js'
import { reanchor } from './seed.js'
import { createSessions, resolveInitialPassword } from './auth.js'
import {
  ROLES, hashPassword, verifyPassword, validateUsername, validatePassword,
  publicUser, isLastAdmin, usernameFromLastName,
} from './users.js'
import { createRateLimiter } from './rate-limit.js'
import { PERMISSIONS, can, sanitisePermissions, forbiddenChange, managePermission } from './permissions.js'
import { stampVehicles } from './stamps.js'
import { recorderName, moveKey } from './src/keys.js'
import { personName } from './src/labels.js'
import { MIGRATIONS } from './src/migrations.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data')
const DIST_DIR = path.join(__dirname, 'dist')
const SEED_DIR = process.env.SEED_DIR ?? path.join(__dirname, 'data.example')
const PORT = process.env.PORT ?? 3000
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? ''

const sessions = createSessions()

const app = express()
app.disable('x-powered-by')
// Behind a reverse proxy, req.ip must come from X-Forwarded-For, otherwise
// every client shares the proxy's address and they throttle one another.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)

// ── Security headers ──
// The application is reachable from the internet. It loads nothing from
// another origin, so the policy can stay strict: no foreign script, no
// framing by another site (clickjacking), no guessing of content types.
// Inline styles stay allowed because Vue binds style attributes.
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "connect-src 'self'", "object-src 'none'",
      "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  // Only over HTTPS, which behind a proxy needs TRUST_PROXY to be detected.
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000')
  next()
})
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
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
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

// ── Rate limits ──
// Two routes are reachable without a session and both need a budget: the
// public submission form, and the login itself — a single password guards
// the whole application, so unlimited guessing cannot be allowed.

const MAX_STORED_REQUESTS = 2000

const submissionLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5 })
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })

function clientKey(req) {
  return req.ip ?? 'unknown'
}

// ── Authentication ──
// Everything under /api is private except the few routes mounted before the
// guard below: the public request form needs to reach the API without an
// account.

async function readUsers() {
  const raw = await readRaw('users')
  return raw === '[]' ? [] : JSON.parse(raw)
}

async function writeUsers(users) {
  await write('users', JSON.stringify(users, null, 2))
}

/** Attaches the account to the request, or answers 401. */
async function requireAuth(req, res, next) {
  try {
    const userId = sessions.userIdFor(sessions.tokenFrom(req))
    if (!userId) return fail(res, 401, 'auth.required', {}, 'Authentication required')

    const user = (await readUsers()).find(candidate => candidate.id === userId)
    if (!user) {
      // The account was deleted while its session was still alive.
      sessions.revokeUser(userId)
      return fail(res, 401, 'auth.required', {}, 'Authentication required')
    }
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

/** Refuses a request the account has not been granted. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      return fail(res, 403, 'permissions.denied', { permission }, 'Not allowed')
    }
    next()
  }
}

/** Account management and configuration are reserved to administrators. */
function requireAdmin(req, res, next) {
  if (req.user?.role !== ROLES.ADMIN) {
    return fail(res, 403, 'auth.adminOnly', {}, 'Administrator only')
  }
  next()
}

/** Stand-in compared against when the username matches no account. */
const UNKNOWN_ACCOUNT = hashPassword(crypto.randomBytes(16).toString('hex'))

app.post('/api/auth/login', async (req, res, next) => {
  const key = clientKey(req)
  if (loginLimiter.hit(key)) {
    const seconds = loginLimiter.retryAfter(key)
    res.set('Retry-After', String(seconds))
    return fail(res, 429, 'tooManyAttempts', { seconds }, 'Too many attempts')
  }

  try {
    const { username, password } = req.body ?? {}
    const users = await readUsers()
    const user = users.find(candidate => candidate.username === username)

    // The same answer whether the account or the password is wrong, so the
    // response never reveals which usernames exist — nor its timing: an
    // unknown name still costs one password hash.
    if (!user) {
      verifyPassword(password, UNKNOWN_ACCOUNT)
      return fail(res, 401, 'auth.invalidCredentials', {}, 'Wrong username or password')
    }
    if (!verifyPassword(password, user)) {
      return fail(res, 401, 'auth.invalidCredentials', {}, 'Wrong username or password')
    }

    loginLimiter.reset(key) // only failed attempts consume the budget
    const session = sessions.issue(user.id)
    res.json({ token: session.token, expiresAt: session.expiresAt, user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/logout', (req, res) => {
  sessions.revoke(sessions.tokenFrom(req))
  res.json({ ok: true })
})

app.get('/api/auth/check', requireAuth, (_req, res) => res.json({ ok: true }))

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)))

/** Changing one's own password ends every other session of the account. */
app.put('/api/auth/password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body ?? {}
  if (!verifyPassword(currentPassword, req.user)) {
    return fail(res, 403, 'auth.wrongCurrentPassword', {}, 'Wrong current password')
  }
  const weak = validatePassword(newPassword)
  if (weak) return fail(res, 400, `users.${weak.code}`, weak.params, 'Password too short')

  try {
    await withLock('users', async () => {
      const users = await readUsers()
      const index = users.findIndex(user => user.id === req.user.id)
      if (index === -1) return fail(res, 404, 'notFound', {}, 'Unknown account')
      users[index] = { ...users[index], ...hashPassword(newPassword) }
      await writeUsers(users)

      const current = sessions.tokenFrom(req)
      sessions.revokeUser(req.user.id)
      const session = sessions.issue(req.user.id)
      res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, replaced: current !== session.token })
    })
  } catch (err) {
    next(err)
  }
})

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
  if (submissionLimiter.hit(clientKey(req))) {
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
app.use('/api', requireAuth)

// ── Requests, management side ──

app.get('/api/requests', async (_req, res, next) => {
  try {
    res.type('application/json').send(await readRaw('requests'))
  } catch (err) {
    next(err)
  }
})

app.put('/api/requests/:id/status', requirePermission('requests.manage'), async (req, res, next) => {
  const { status, reason } = req.body ?? {}
  if (!isValidRequestStatus(status)) {
    return fail(res, 400, 'validation.unknownValue', { field: 'status' }, 'Unknown status')
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) {
    return fail(res, 400, 'validation.invalidField', { field: 'reason' }, 'Invalid reason')
  }

  try {
    await withLock('requests', async () => {
      const stored = JSON.parse(await readRaw('requests'))
      const index = stored.findIndex(request => request.id === req.params.id)
      if (index === -1) return fail(res, 404, 'notFound', {}, 'Unknown request')

      // Who decided and when is recorded server-side: the client cannot claim
      // a decision was taken by somebody else.
      const decided = status !== 'pending'
      stored[index] = {
        ...stored[index],
        status,
        decidedBy: decided ? req.user.username : null,
        decidedAt: decided ? localDateTime() : null,
        decisionReason: decided ? (reason ?? '').trim() : '',
      }
      await write('requests', JSON.stringify(stored, null, 2))
      res.json({
        ok: true,
        decidedBy: stored[index].decidedBy,
        decidedAt: stored[index].decidedAt,
      })
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/requests/:id', requirePermission('requests.manage'), async (req, res, next) => {
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

// A write-ahead transaction is replayed before serving after an interrupted save.
async function commitResources(changes) {
  await write('resource-transaction', JSON.stringify(changes))
  for (const [entity, content] of Object.entries(changes)) await write(entity, content)
  await fs.unlink(fileOf('resource-transaction'))
}

async function recoverResources() {
  try {
    const changes = JSON.parse(await fs.readFile(fileOf('resource-transaction'), 'utf-8'))
    for (const [entity, content] of Object.entries(changes)) await write(entity, content)
    await fs.unlink(fileOf('resource-transaction'))
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}

async function withResources(fn) {
  return withLock('resources', async () => {
    await withLock('users', recoverResources)
    return fn()
  })
}

async function readJournal() {
  try { return JSON.parse(await fs.readFile(fileOf('journal'), 'utf-8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return mergeJournal({ entries: [], archives: [] }, JSON.parse(await readRaw('vehicles')))
  }
}

app.get('/api/journal', async (_req, res, next) => {
  try {
    await withResources(async () => {
      const journal = await readJournal()
      const content = JSON.stringify(journal)
      // Written once, when it is first built from the vehicles' histories.
      try { await fs.access(fileOf('journal')) } catch { await write('journal', content) }
      res.set('ETag', `"${versionOf(content)}"`).json(journal)
    })
  } catch (error) { next(error) }
})

app.post('/api/journal/archives', requireAdmin, async (req, res, next) => {
  try {
    await withResources(async () => {
      const journal = await readJournal()
      const expected = (req.get('If-Match') ?? '').replace(/"/g, '')
      if (expected !== versionOf(JSON.stringify(journal))) return fail(res, 409, 'journal.changed')
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      if (typeof name !== 'string' || !name || name.length > 120) return fail(res, 400, 'journal.nameRequired')
      const vehicles = JSON.parse(await readRaw('vehicles'))
      if (vehicles.some(v => v.keyHolder)) return fail(res, 409, 'journal.keysOut')
      if (!journal.entries.length) return fail(res, 400, 'journal.empty')
      const archive = { id: crypto.randomUUID(), name, archivedAt: localDateTime(), archivedBy: req.user.username, entries: journal.entries }
      const updated = { sequence: journal.sequence, entries: [], archives: [...journal.archives, archive] }
      await write('journal', JSON.stringify(updated))
      res.json({ id: archive.id })
    })
  } catch (error) { next(error) }
})

/**
 * Writes a collection once its new state is decided — the whole fleet sent
 * at once, or one record created, changed or deleted. Everything that goes
 * with a write happens here: references checked, key history protected,
 * deletions guarded, past missions keeping what they named, the key log and
 * the accounts kept in step.
 *
 * @returns {Promise<string|null>} the new version, or null once a refusal
 *          has been answered
 */
async function storeCollection(req, res, entity, stored, next) {
  if (entity === 'missions') {
    // Only what this write adds is checked: a mission written long ago may
    // name somebody deleted by an older version, and that must not stop
    // anybody from planning today.
    const ghost = unknownReference(next, JSON.parse(await readRaw('persons')),
      JSON.parse(await readRaw('vehicles')), JSON.parse(await readRaw('trailers')), stored)
    if (ghost) { fail(res, 400, `validation.${ghost.code}`, ghost.params, 'Unknown reference'); return null }
  }
  if (entity === 'vehicles') {
    stampVehicles(stored, next, {
      recordedBy: recorderName(req.user, JSON.parse(await readRaw('persons'))),
      recordedById: req.user.id,
      at: localDateTime(),
    })
  }
  const content = JSON.stringify(next, null, 2)
  const removed = stored.filter(item => !next.some(candidate => candidate.id === item.id))
  const cleanup = {}
  if (['persons', 'vehicles', 'trailers'].includes(entity) && removed.length) {
    const missions = JSON.parse(await readRaw('missions'))
    const blocked = deletionBlocker(entity, removed, JSON.parse(await readRaw('vehicles')), missions, localDateTime())
    if (blocked) { fail(res, 409, blocked.code, blocked.params); return null }
    const remembered = rememberResources(entity, removed, missions)
    if (JSON.stringify(remembered) !== JSON.stringify(missions)) cleanup.missions = JSON.stringify(remembered, null, 2)
  }
  if (entity === 'vehicles') {
    const journal = mergeJournal(await readJournal(), next)
    await commitResources({ ...cleanup, vehicles: content, journal: JSON.stringify(journal) })
  } else if (entity === 'persons' && removed.length) {
    const done = await withLock('users', async () => {
      const users = await readUsers()
      const removedIds = new Set(removed.map(person => person.id))
      const remaining = users.filter(user => !removedIds.has(user.personId))
      if (!remaining.some(user => user.role === ROLES.ADMIN)) {
        fail(res, 409, 'users.lastAdmin'); return false
      }
      await commitResources({ ...cleanup, persons: content, users: JSON.stringify(remaining, null, 2) })
      return true
    })
    if (!done) return null
  } else if (Object.keys(cleanup).length) {
    await commitResources({ ...cleanup, [entity]: content })
  } else {
    await write(entity, content)
  }
  return versionOf(content)
}

/**
 * Two readings of a record are the same when they say the same thing,
 * whatever order their fields came in.
 */
function sameRecord(a, b) {
  const stable = value => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
      : value
  return JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null))
}

// ── API routes ──

for (const entity of ENTITIES) {
  app.get(`/api/${entity}`, async (_req, res, next) => {
    try {
      await withResources(async () => {
        const raw = await readRaw(entity)
        // A version detects edits made by another tab.
        res.set('ETag', `"${versionOf(raw)}"`)
        res.type('application/json').send(raw)
      })
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
      await withResources(async () => {
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

        // Without the right to manage this collection, a write is weighed
        // field by field. The stored records are read the way the interface
        // reads them, defaults included: a field an older version never wrote
        // is not a change. Key movements and checks have routes of their own.
        if (!can(req.user, managePermission(entity))) {
          const migrate = MIGRATIONS[entity]
          const forbidden = forbiddenChange(entity, migrate(JSON.parse(await readRaw(entity))), migrate(req.body))
          if (forbidden) {
            return fail(res, 403, `permissions.${forbidden.code}`, forbidden.params,
              'Not allowed to change this collection')
          }
        }

        const stored = JSON.parse(await readRaw(entity))
        const version = await storeCollection(req, res, entity, stored, req.body)
        if (!version) return
        res.set('ETag', `"${version}"`)
        res.json({ ok: true, version })
      })
    } catch (err) {
      next(err)
    }
  })

  // ── One record at a time ──
  // Creating, changing or deleting one record never trips over somebody
  // else's work on another record: only that record is compared with what
  // the client last saw (`original`), and only a real clash — the same record
  // changed meanwhile — is refused.

  app.post(`/api/${entity}`, async (req, res, next) => {
    if (!can(req.user, managePermission(entity))) {
      return fail(res, 403, 'permissions.created', { entity }, 'Not allowed to create')
    }
    const item = req.body
    const invalid = validateCollection(entity, [item])
    if (invalid) return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid record')
    try {
      await withResources(async () => {
        const raw = await readRaw(entity)
        const stored = JSON.parse(raw)
        if (stored.some(existing => existing.id === item.id)) {
          return fail(res, 409, 'validation.duplicateId', { id: item.id }, 'Record already exists')
        }
        const updated = [...stored, item]
        const version = await storeCollection(req, res, entity, stored, updated)
        if (!version) return
        res.status(201).json({ item: updated.at(-1), version, previous: versionOf(raw) })
      })
    } catch (err) {
      next(err)
    }
  })

  app.put(`/api/${entity}/:id`, async (req, res, next) => {
    const { item, original } = req.body ?? {}
    if (!item || item.id !== req.params.id) return fail(res, 400, 'validation.missingId', {}, 'Record and route disagree')
    const invalid = validateCollection(entity, [item])
    if (invalid) return fail(res, 400, `validation.${invalid.code}`, invalid.params, 'Invalid record')
    try {
      await withResources(async () => {
        const raw = await readRaw(entity)
        const stored = JSON.parse(raw)
        const index = stored.findIndex(existing => existing.id === item.id)
        if (index === -1) return fail(res, 404, 'gone', { entity }, 'Record deleted meanwhile')
        const migrate = MIGRATIONS[entity]
        const [current] = migrate([stored[index]])
        if (original !== undefined && !sameRecord(current, original)) {
          return fail(res, 409, 'conflict', { entity }, 'Record changed meanwhile')
        }
        if (!can(req.user, managePermission(entity))) {
          const forbidden = forbiddenChange(entity, [current], migrate([item]))
          if (forbidden) return fail(res, 403, `permissions.${forbidden.code}`, forbidden.params, 'Not allowed')
        }
        const updated = stored.map(existing => existing.id === item.id ? item : existing)
        const version = await storeCollection(req, res, entity, stored, updated)
        if (!version) return
        res.json({ item: updated[index], version, previous: versionOf(raw) })
      })
    } catch (err) {
      next(err)
    }
  })

  app.delete(`/api/${entity}/:id`, async (req, res, next) => {
    if (!can(req.user, managePermission(entity))) {
      return fail(res, 403, 'permissions.deleted', { entity }, 'Not allowed to delete')
    }
    try {
      await withResources(async () => {
        const raw = await readRaw(entity)
        const stored = JSON.parse(raw)
        if (!stored.some(existing => existing.id === req.params.id)) {
          return fail(res, 404, 'gone', { entity }, 'Record deleted meanwhile')
        }
        const updated = stored.filter(existing => existing.id !== req.params.id)
        const version = await storeCollection(req, res, entity, stored, updated)
        if (!version) return
        res.json({ ok: true, version, previous: versionOf(raw) })
      })
    } catch (err) {
      next(err)
    }
  })
}

// ── Counter actions on one vehicle ──
// Taking a key or recording a check changes one vehicle, and any account may
// do it. It is applied by the server to the vehicle as stored, rather than
// sent as the whole fleet: a counter must not trip over somebody else's
// unrelated save, nor over a field its own copy filled in. Who did it and
// when are the server's to say.

/**
 * Applies `change` to the stored vehicle and answers it back, with the
 * fleet's version before and after: a client whose copy was current can
 * keep using it.
 */
function changeVehicle(change) {
  return async (req, res, next) => {
    try {
      await withResources(async () => {
        const raw = await readRaw('vehicles')
        const vehicles = JSON.parse(raw)
        const vehicle = vehicles.find(candidate => candidate.id === req.params.id)
        if (!vehicle) return fail(res, 404, 'notFound', {}, 'Unknown vehicle')

        const persons = JSON.parse(await readRaw('persons'))
        const refused = change(vehicle, {
          persons,
          at: localDateTime(),
          recordedBy: recorderName(req.user, persons),
          user: req.user,
          body: req.body ?? {},
          params: req.params,
        })
        if (refused) return fail(res, refused.status ?? 400, refused.code, refused.params ?? {})

        const content = JSON.stringify(vehicles, null, 2)
        await commitResources({ vehicles: content, journal: JSON.stringify(mergeJournal(await readJournal(), vehicles)) })
        const version = versionOf(content)
        res.set('ETag', `"${version}"`).json({ vehicle, version, previous: versionOf(raw) })
      })
    } catch (err) {
      next(err)
    }
  }
}

/** Takes, passes on or returns a key: `holder` is who gets it, null to hang it up. */
app.post('/api/vehicles/:id/key', changeVehicle((vehicle, { persons, at, recordedBy, body }) => {
  const { holder = null, expected } = body
  // The screen showed the key with somebody — or on the board. If that is no
  // longer true, somebody at another counter moved it: taking it now would
  // silently turn their holding into a transfer.
  if (expected !== undefined) {
    const now = vehicle.keyHolder ?? null
    const same = (now?.personId ?? null) === (expected?.personId ?? null) && (now?.name ?? null) === (expected?.name ?? null)
    if (!same) return { status: 409, code: 'keys.moved', params: { plate: vehicle.plate || vehicle.name } }
  }
  let next = null
  if (holder !== null) {
    if (typeof holder !== 'object' || Array.isArray(holder)) return { code: 'validation.invalidField', params: { field: 'keyHolder' } }
    if (holder.personId) {
      const person = persons.find(candidate => candidate.id === holder.personId)
      if (!person) return { code: 'validation.unknownReference', params: { field: 'personId' } }
      // A declared person is named by their record, whatever the client says.
      next = { personId: person.id, name: personName(person) }
    } else {
      const name = typeof holder.name === 'string' ? holder.name.trim() : ''
      if (!name || name.length > 200) return { code: 'validation.invalidField', params: { field: 'name' } }
      next = { personId: null, name }
    }
  }
  const refused = moveKey(vehicle, { holder: next, recordedBy, at, id: crypto.randomUUID() })
  return refused ? { status: 409, code: `keys.${refused}`, params: { plate: vehicle.plate || vehicle.name } } : null
}))

/** Records a weekly check, done by a person or described by a note. */
app.post('/api/vehicles/:id/checks', changeVehicle((vehicle, { persons, recordedBy, user, body }) => {
  const { date, personId = null, note = '' } = body
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) {
    return { code: 'validation.invalidField', params: { field: 'date' } }
  }
  if (personId && !persons.some(person => person.id === personId)) {
    return { code: 'validation.unknownReference', params: { field: 'personId' } }
  }
  const text = typeof note === 'string' ? note.trim() : ''
  if (!personId && (!text || text.length > 500)) return { code: 'validation.invalidField', params: { field: 'note' } }
  vehicle.checks = [...(vehicle.checks ?? []), {
    id: crypto.randomUUID(), date, personId: personId || null, note: personId ? '' : text,
    recordedBy, recordedById: user.id,
  }]
  return null
}))

/** Withdraws a check: its author may, and so may whoever manages vehicles. */
app.delete('/api/vehicles/:id/checks/:checkId', changeVehicle((vehicle, { user, params }) => {
  const check = (vehicle.checks ?? []).find(candidate => candidate.id === params.checkId)
  if (!check) return { status: 404, code: 'notFound' }
  if (!can(user, 'vehicles.manage') && check.recordedById !== user.id) {
    return { status: 403, code: 'permissions.checkRemoval', params: { plate: vehicle.plate || vehicle.name } }
  }
  vehicle.checks = vehicle.checks.filter(candidate => candidate !== check)
  return null
}))

// ── Person accounts ──
// A person signs in with their family name. Setting the password is part of
// managing the person, so it is open to any signed-in user; the role of such
// an account is always "user" — promoting one stays an administrator's job.

/**
 * Managing persons lets an account set the password of a plain one. An
 * account holding rights — let alone an administrator — is left to the
 * administrators, or anybody with `persons.manage` could take it over.
 */
function outranks(target, actor) {
  if (actor.role === ROLES.ADMIN) return false
  return target.role === ROLES.ADMIN || Object.keys(sanitisePermissions(target.permissions)).length > 0
}

/** Which persons hold an account. Ids only: no account detail leaks here. */
app.get('/api/persons/accounts', async (_req, res, next) => {
  try {
    const users = await readUsers()
    res.json(users.filter(user => user.personId).map(user => user.personId))
  } catch (err) {
    next(err)
  }
})

app.put('/api/persons/:id/account', requirePermission('persons.manage'), async (req, res, next) => {
  const { password, lastName } = req.body ?? {}
  const weak = validatePassword(password)
  if (weak) return fail(res, 400, `users.${weak.code}`, weak.params, 'Password too short')

  const username = usernameFromLastName(lastName)
  if (!username || username.length < 3) {
    return fail(res, 400, 'users.invalidLastName', {}, 'Family name unusable as a login')
  }

  try {
    await withLock('users', async () => {
      const users = await readUsers()
      const existing = users.findIndex(user => user.personId === req.params.id)

      // Another person already signs in under this family name.
      const taken = users.some(user =>
        user.username === username && user.personId !== req.params.id)
      if (taken) {
        return fail(res, 409, 'users.usernameTaken', { username }, 'Family name already used')
      }
      if (existing !== -1 && outranks(users[existing], req.user)) {
        return fail(res, 403, 'users.privilegedAccount', {}, 'Only an administrator may change this account')
      }

      if (existing === -1) {
        const user = {
          id: crypto.randomUUID(),
          username,
          role: ROLES.USER,
          permissions: {},
          personId: req.params.id,
          createdAt: localDateTime(),
          ...hashPassword(password),
        }
        await writeUsers([...users, user])
        return res.status(201).json(publicUser(user))
      }

      // Keep whatever role an administrator may have granted.
      users[existing] = { ...users[existing], username, ...hashPassword(password) }
      await writeUsers(users)
      sessions.revokeUser(users[existing].id)
      res.json(publicUser(users[existing]))
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/persons/:id/account', requirePermission('persons.manage'), async (req, res, next) => {
  try {
    await withLock('users', async () => {
      const users = await readUsers()
      const target = users.find(user => user.personId === req.params.id)
      if (!target) return res.json({ ok: true, removed: false })
      if (outranks(target, req.user)) {
        return fail(res, 403, 'users.privilegedAccount', {}, 'Only an administrator may change this account')
      }
      if (isLastAdmin(users, target.id)) {
        return fail(res, 409, 'users.lastAdmin', {}, 'The last administrator cannot be removed')
      }
      await writeUsers(users.filter(user => user.id !== target.id))
      sessions.revokeUser(target.id)
      res.json({ ok: true, removed: true })
    })
  } catch (err) {
    next(err)
  }
})

// ── Accounts ──
// Reserved to administrators: an ordinary account manages the fleet, not who
// may reach it.

app.get('/api/users', requireAdmin, async (_req, res, next) => {
  try {
    res.json((await readUsers()).map(publicUser))
  } catch (err) {
    next(err)
  }
})

app.post('/api/users', requireAdmin, async (req, res, next) => {
  const { username, password, role = ROLES.USER, personId = null, permissions } = req.body ?? {}
  if (!Object.values(ROLES).includes(role)) {
    return fail(res, 400, 'validation.unknownValue', { field: 'role' }, 'Unknown role')
  }
  const weak = validatePassword(password)
  if (weak) return fail(res, 400, `users.${weak.code}`, weak.params, 'Password too short')

  try {
    await withLock('users', async () => {
      const users = await readUsers()
      const badName = validateUsername(username, users)
      if (badName) return fail(res, 400, `users.${badName.code}`, badName.params, 'Invalid username')

      const user = {
        id: crypto.randomUUID(),
        username,
        role,
        permissions: sanitisePermissions(permissions),
        personId: personId || null,
        createdAt: localDateTime(),
        ...hashPassword(password),
      }
      await writeUsers([...users, user])
      res.status(201).json(publicUser(user))
    })
  } catch (err) {
    next(err)
  }
})

app.put('/api/users/:id', requireAdmin, async (req, res, next) => {
  const { username, role, personId, password, permissions } = req.body ?? {}
  try {
    await withLock('users', async () => {
      const users = await readUsers()
      const index = users.findIndex(user => user.id === req.params.id)
      if (index === -1) return fail(res, 404, 'notFound', {}, 'Unknown account')

      const target = users[index]
      const next_ = { ...target }

      if (username !== undefined) {
        const badName = validateUsername(username, users, target.id)
        if (badName) return fail(res, 400, `users.${badName.code}`, badName.params, 'Invalid username')
        next_.username = username
      }
      if (role !== undefined) {
        if (!Object.values(ROLES).includes(role)) {
          return fail(res, 400, 'validation.unknownValue', { field: 'role' }, 'Unknown role')
        }
        // Losing the last administrator would lock everyone out of the settings.
        if (role !== ROLES.ADMIN && isLastAdmin(users, target.id)) {
          return fail(res, 409, 'users.lastAdmin', {}, 'The last administrator must stay one')
        }
        next_.role = role
      }
      if (personId !== undefined) next_.personId = personId || null
      if (permissions !== undefined) next_.permissions = sanitisePermissions(permissions)

      if (password !== undefined) {
        const weakPassword = validatePassword(password)
        if (weakPassword) return fail(res, 400, `users.${weakPassword.code}`, weakPassword.params, 'Password too short')
        Object.assign(next_, hashPassword(password))
      }

      users[index] = next_
      await writeUsers(users)
      // A password reset or a demotion must not leave an old session alive.
      if (password !== undefined || next_.role !== target.role) sessions.revokeUser(target.id)
      res.json(publicUser(next_))
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/users/:id', requireAdmin, async (req, res, next) => {
  if (req.params.id === req.user.id) {
    return fail(res, 409, 'users.selfDelete', {}, 'You cannot delete your own account')
  }
  try {
    await withLock('users', async () => {
      const users = await readUsers()
      if (!users.some(user => user.id === req.params.id)) {
        return fail(res, 404, 'notFound', {}, 'Unknown account')
      }
      if (isLastAdmin(users, req.params.id)) {
        return fail(res, 409, 'users.lastAdmin', {}, 'The last administrator cannot be deleted')
      }
      await writeUsers(users.filter(user => user.id !== req.params.id))
      sessions.revokeUser(req.params.id)
      res.json({ ok: true })
    })
  } catch (err) {
    next(err)
  }
})

// ── Configuration ──

app.put('/api/config', requireAdmin, async (req, res, next) => {
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

app.put('/api/parc', requirePermission('park.manage'), async (req, res, next) => {
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

app.put('/api/parc/image', requirePermission('park.manage'), async (req, res, next) => {
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

app.delete('/api/parc/image', requirePermission('park.manage'), async (req, res, next) => {
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

/**
 * Single-page fallback.
 *
 * Only navigations get index.html. A request for a file that does not exist
 * must answer 404 rather than a 200 page: otherwise a missing script or icon
 * comes back as HTML, the browser cannot make sense of it, and a cache in
 * front of the application happily stores the wrong body under that URL.
 */
app.get('*', async (req, res) => {
  const looksLikeFile = path.extname(req.path) !== ''
  const wantsHtml = (req.get('Accept') ?? '').includes('text/html')
  if (looksLikeFile || !wantsHtml) {
    return res.status(404).type('text/plain').send('Not found')
  }

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
  // The stack only: a malformed body is attached to its error and may hold
  // a password typed into the login form.
  console.error('[server]', err.stack ?? String(err))
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

/** Creates the first administrator when no account exists yet. */
async function seedAdministrator() {
  const users = await readUsers()
  if (users.length > 0) return

  const { password } = resolveInitialPassword()
  await writeUsers([{
    id: crypto.randomUUID(),
    username: 'admin',
    role: ROLES.ADMIN,
    personId: null,
    createdAt: localDateTime(),
    ...hashPassword(password),
  }])
}

async function start() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await recoverResources()
  await seedData()
  await seedAdministrator()
  app.listen(PORT, () => {
    console.log(`Server → http://localhost:${PORT}`)

  })
}

start().catch(err => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})
