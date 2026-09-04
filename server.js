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
import { createSessions, resolveInitialPassword } from './auth.js'
import {
  ROLES, hashPassword, verifyPassword, validateUsername, validatePassword,
  publicUser, isLastAdmin, usernameFromLastName,
} from './users.js'
import { createRateLimiter } from './rate-limit.js'
import { PERMISSIONS, can, sanitisePermissions, forbiddenChange } from './permissions.js'

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
    // response never reveals which usernames exist.
    if (!user || !verifyPassword(password, user)) {
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

        // Without the right to manage this collection, an account may still
        // record what it does with it — a key movement, a check, an absence.
        // The write is therefore weighed field by field rather than refused.
        if (!can(req.user, `${entity}.manage`)) {
          const stored = JSON.parse(await readRaw(entity))
          const forbidden = forbiddenChange(entity, stored, req.body)
          if (forbidden) {
            return fail(res, 403, `permissions.${forbidden.code}`, forbidden.params,
              'Not allowed to change this collection')
          }
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

// ── Person accounts ──
// A person signs in with their family name. Setting the password is part of
// managing the person, so it is open to any signed-in user; the role of such
// an account is always "user" — promoting one stays an administrator's job.

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
