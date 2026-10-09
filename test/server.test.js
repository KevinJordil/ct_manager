import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4173 + Math.floor(Math.random() * 200)
const PASSWORD = 'test-password'
const BASE = `http://127.0.0.1:${PORT}`

let server
let dataDir
let token

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`${BASE}/api/auth/check`)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error('the server did not start')
}

async function signIn(password = PASSWORD, username = 'admin') {
  return fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-manager-test-'))
  // Seed pointed at an empty directory: these tests start from blank collections.
  const emptySeed = path.join(dataDir, 'empty-seed')
  await fs.mkdir(emptySeed)
  server = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, SEED_DIR: emptySeed, CT_PASSWORD: PASSWORD },
    stdio: 'ignore',
  })
  await waitForServer()
  token = (await (await signIn()).json()).token
}, 30000)

afterAll(async () => {
  server?.kill()
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true })
})

const auth = () => ({ Authorization: `Bearer ${token}` })

function get(entity, headers = auth()) {
  return fetch(`${BASE}/api/${entity}`, { headers })
}

function put(entity, data, { version = '*', headers = auth() } = {}) {
  return fetch(`${BASE}/api/${entity}`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      ...(version === null ? {} : { 'If-Match': version }),
    },
    body: JSON.stringify(data),
  })
}

const person = (over = {}) => ({
  id: 'p1', lastName: 'Müller', firstName: 'Andreas', licenses: ['930'],
  leaves: [], unavailable: false, ...over,
})

const versionFrom = res => res.headers.get('ETag').replace(/"/g, '')

describe('authentication', () => {
  it('rejects a request without a token', async () => {
    expect((await get('persons', {})).status).toBe(401)
  })

  it('rejects an invented token', async () => {
    expect((await get('persons', { Authorization: 'Bearer not-a-real-token' })).status).toBe(401)
  })

  it('returns a translatable code, not prose', async () => {
    const body = await (await get('persons', {})).json()
    expect(body.code).toBe('auth.required')
  })

  it('accepts a token obtained by logging in', async () => {
    expect((await get('persons')).status).toBe(200)
  })

  it('refuses the wrong password', async () => {
    const res = await signIn('wrong-password')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('auth.invalidCredentials')
  })

  it('answers the same for an unknown account, so usernames stay private', async () => {
    const unknown = await (await signIn('whatever', 'ghost')).json()
    const wrong = await (await signIn('wrong-password')).json()
    expect(unknown.code).toBe(wrong.code)
  })

  it('returns the account alongside the token', async () => {
    const body = await (await signIn()).json()
    expect(body.user).toMatchObject({ username: 'admin', role: 'admin' })
    expect(body.user).not.toHaveProperty('digest')
    expect(body.user).not.toHaveProperty('salt')
  })

  it('never hands the password back as the token', async () => {
    const body = await (await signIn()).json()
    expect(body.token).not.toBe(PASSWORD)
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('issues a different token on each login', async () => {
    const first = (await (await signIn()).json()).token
    const second = (await (await signIn()).json()).token
    expect(first).not.toBe(second)
  })

  it('keeps earlier sessions valid after a new login', async () => {
    const other = (await (await signIn()).json()).token
    expect((await get('persons', { Authorization: `Bearer ${other}` })).status).toBe(200)
    expect((await get('persons')).status).toBe(200)
  })

  it('invalidates a token on logout', async () => {
    const temporary = (await (await signIn()).json()).token
    expect((await get('persons', { Authorization: `Bearer ${temporary}` })).status).toBe(200)

    await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${temporary}` },
    })
    expect((await get('persons', { Authorization: `Bearer ${temporary}` })).status).toBe(401)
    // The other sessions are untouched.
    expect((await get('persons')).status).toBe(200)
  })
})

describe('reading', () => {
  it('returns an empty array when the file does not exist', async () => {
    expect(await (await get('vehicles')).json()).toEqual([])
  })

  it('exposes a version through ETag', async () => {
    expect((await get('persons')).headers.get('ETag')).toMatch(/^"[0-9a-f]{16}"$/)
  })

  it('answers in JSON on an unknown route', async () => {
    const res = await fetch(`${BASE}/api/unknown`, { headers: auth() })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('notFound')
  })
})

describe('writing', () => {
  it('stores then reads back the data', async () => {
    const res = await put('persons', [person()])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.version).toMatch(/^[0-9a-f]{16}$/)

    expect(await (await get('persons')).json()).toEqual([person()])
  })

  it('writes readable JSON to disk', async () => {
    await put('vehicles', [{ id: 'v1', name: 'Duro', category: 'medium', status: 'free', seats: 8 }])
    const raw = await fs.readFile(path.join(dataDir, 'vehicles.json'), 'utf-8')
    expect(JSON.parse(raw)).toHaveLength(1)
    expect(raw).toContain('\n  ') // indented, so it stays readable by hand
  })

  it('leaves no temporary file behind', async () => {
    await put('persons', [person()])
    const files = await fs.readdir(dataDir)
    expect(files.filter(name => name.includes('.tmp'))).toEqual([])
  })
})

describe('validation', () => {
  it('rejects anything that is not an array', async () => {
    const res = await put('persons', { id: 'p1' })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.notAnArray')
  })

  it('rejects a malformed item without touching the data', async () => {
    await put('persons', [person()])
    const before = await (await get('persons')).json()

    const res = await put('persons', [{ id: 'p2', lastName: 42, firstName: 'X' }])
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.invalidField')

    expect(await (await get('persons')).json()).toEqual(before)
  })

  it('rejects duplicate identifiers', async () => {
    const res = await put('persons', [person(), person()])
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.duplicateId')
  })

  it('carries the parameters needed to render the message', async () => {
    const res = await put('persons', [person(), { id: 'p2', lastName: 42, firstName: 'X' }])
    const body = await res.json()
    expect(body.params).toMatchObject({ index: 1, field: 'lastName' })
  })

  it('rejects invalid JSON', async () => {
    const res = await fetch(`${BASE}/api/persons`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json', 'If-Match': '*' },
      body: '{ not json',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('malformedJson')
  })
})

describe('protection against concurrent overwrites', () => {
  it('requires an If-Match header', async () => {
    const res = await put('missions', [], { version: null })
    expect(res.status).toBe(428)
    expect((await res.json()).code).toBe('preconditionRequired')
  })

  it('accepts a write based on the current version', async () => {
    const version = versionFrom(await get('persons'))
    expect((await put('persons', [person({ lastName: 'New' })], { version })).status).toBe(200)
  })

  it('rejects a write based on a stale version', async () => {
    const stale = versionFrom(await get('persons'))

    // Another tab saves meanwhile.
    await put('persons', [person({ lastName: 'ByAnother' })], { version: stale })

    const res = await put('persons', [person({ lastName: 'Overwrite' })], { version: stale })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('conflict')
    expect(body.params.version).toMatch(/^[0-9a-f]{16}$/)

    // The first writer's data is intact.
    const stored = await (await get('persons')).json()
    expect(stored[0].lastName).toBe('ByAnother')
  })

  it('returns a version that changes on every write', async () => {
    const first = (await put('missions', [{ id: 'm1', title: 'A' }])).headers.get('ETag')
    const second = (await put('missions', [{ id: 'm1', title: 'B' }],
      { version: first.replace(/"/g, '') })).headers.get('ETag')
    expect(first).not.toBe(second)
  })
})

// ── Vehicle requests ──

const submission = (over = {}) => ({
  contact: { firstName: 'Jean', lastName: 'Dupont', company: 'Cp 4', section: '', phone: '+41 79 000 00 00' },
  startDate: '2026-09-10T08:00',
  endDate: '2026-09-10T17:00',
  meetingPoint: "Place d'armes",
  comment: '',
  vehicles: [{ type: 'duro-personnel', driverRequired: true }],
  ...over,
})

function submitRequest(body = submission(), headers = {}) {
  return fetch(`${BASE}/api/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('public request submission', () => {
  it('accepts a submission without any session', async () => {
    const res = await submitRequest()
    expect(res.status).toBe(201)
    expect((await res.json()).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects a malformed submission', async () => {
    const res = await submitRequest({ contact: { firstName: 'X' } })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toMatch(/^validation\./)
  })

  it('stamps the status and the creation time server-side', async () => {
    await submitRequest()
    const stored = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const last = stored[stored.length - 1]
    expect(last.status).toBe('pending')
    expect(last.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('ignores a status or id supplied by the client', async () => {
    await submitRequest(submission({ status: 'approved', id: 'forged' }))
    const stored = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const forged = stored.find(request => request.id === 'forged')
    expect(forged).toBeUndefined()
    expect(stored[stored.length - 1].status).toBe('pending')
  })

  it('rate-limits repeated submissions from the same client', async () => {
    // The first submissions above already consumed part of the window.
    let sawLimit = false
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await submitRequest()
      if (res.status === 429) {
        expect((await res.json()).code).toBe('tooManyRequests')
        sawLimit = true
        break
      }
    }
    expect(sawLimit).toBe(true)
  })
})

describe('request management', () => {
  it('requires a session to read the queue', async () => {
    expect((await fetch(`${BASE}/api/requests`)).status).toBe(401)
    expect((await fetch(`${BASE}/api/requests`, { headers: auth() })).status).toBe(200)
  })

  it('changes a status', async () => {
    const stored = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const { id } = stored[0]

    const res = await fetch(`${BASE}/api/requests/${id}/status`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(res.status).toBe(200)

    const updated = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    expect(updated.find(request => request.id === id).status).toBe('approved')
  })

  it('refuses an unknown status', async () => {
    const stored = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const res = await fetch(`${BASE}/api/requests/${stored[0].id}/status`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'maybe' }),
    })
    expect(res.status).toBe(400)
  })

  it('answers 404 on an unknown request', async () => {
    const res = await fetch(`${BASE}/api/requests/does-not-exist/status`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(res.status).toBe(404)
  })

  it('deletes a request', async () => {
    const before = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const { id } = before[0]

    const res = await fetch(`${BASE}/api/requests/${id}`, { method: 'DELETE', headers: auth() })
    expect(res.status).toBe(200)

    const after = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    expect(after.find(request => request.id === id)).toBeUndefined()
    expect(after).toHaveLength(before.length - 1)
  })

  it('requires a session to delete', async () => {
    const stored = await (await fetch(`${BASE}/api/requests`, { headers: auth() })).json()
    const res = await fetch(`${BASE}/api/requests/${stored[0].id}`, { method: 'DELETE' })
    expect(res.status).toBe(401)
  })
})

// ── Vehicle park ──

const PNG_DATA_URL = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64')

function parkRequest(path, options = {}) {
  return fetch(`${BASE}/api/parc${path}`, {
    ...options,
    headers: { ...auth(), ...(options.headers ?? {}) },
  })
}

describe('vehicle park', () => {
  it('starts from an empty layout', async () => {
    const layout = await (await parkRequest('')).json()
    expect(layout).toEqual({ hasImage: false, zones: [], colorLabels: {} })
  })

  it('requires a session everywhere', async () => {
    expect((await fetch(`${BASE}/api/parc`)).status).toBe(401)
    expect((await fetch(`${BASE}/api/parc/image`)).status).toBe(401)
  })

  it('stores and reads back a layout', async () => {
    const layout = {
      hasImage: false,
      zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.15, angle: 90, color: '#ef4444' }],
      colorLabels: { '#ef4444': 'Trucks' },
    }
    const res = await parkRequest('', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
    expect(res.status).toBe(200)
    expect(await (await parkRequest('')).json()).toEqual(layout)
  })

  it('rejects a zone outside the image', async () => {
    const res = await parkRequest('', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones: [{ id: 'z1', x: 5, y: 0, w: 0.1, h: 0.1 }] }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.invalidField')
  })

  it('answers 404 while no plan has been uploaded', async () => {
    const res = await parkRequest('/image')
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('noImage')
  })

  it('stores a plan and serves it back with its media type', async () => {
    const put = await parkRequest('/image', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: PNG_DATA_URL }),
    })
    expect(put.status).toBe(200)

    const get = await parkRequest('/image')
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toContain('image/png')
    expect(Buffer.from(await get.arrayBuffer()).toString()).toBe('fake-png-bytes')
  })

  it('keeps a single plan when the format changes', async () => {
    await parkRequest('/image', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/webp;base64,' + Buffer.from('webp').toString('base64') }),
    })
    const files = await fs.readdir(dataDir)
    expect(files.filter(name => name.startsWith('parc-image.'))).toEqual(['parc-image.webp'])
  })

  it('rejects a payload that is not an image', async () => {
    const res = await parkRequest('/image', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:text/html;base64,AAAA' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.invalidImage')
  })

  it('deletes the plan', async () => {
    expect((await parkRequest('/image', { method: 'DELETE' })).status).toBe(200)
    expect((await parkRequest('/image')).status).toBe(404)
    const files = await fs.readdir(dataDir)
    expect(files.filter(name => name.startsWith('parc-image.'))).toEqual([])
  })
})

// ── Configuration ──

describe('configuration', () => {
  it('is readable without a session, because the public form needs it', async () => {
    const res = await fetch(`${BASE}/api/config`)
    expect(res.status).toBe(200)
    const config = await res.json()
    expect(config.requestVehicleTypes.length).toBeGreaterThan(0)
    expect(config.licenses).toContain('930')
  })

  it('requires a session to be changed', async () => {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it('stores a configuration and completes what is missing', async () => {
    const current = await (await fetch(`${BASE}/api/config`)).json()
    const res = await fetch(`${BASE}/api/config`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current, licenses: [...current.licenses, '940'] }),
    })
    expect(res.status).toBe(200)

    const stored = await (await fetch(`${BASE}/api/config`)).json()
    expect(stored.licenses).toContain('940')
    expect(stored.licensesByCategory.heavy).toEqual(current.licensesByCategory.heavy)
  })

  it('refuses an invalid configuration', async () => {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestVehicleTypes: [], licenses: ['920'] }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation.emptyList')
  })

  it('lets a configured vehicle type through on the public form', async () => {
    const current = await (await fetch(`${BASE}/api/config`)).json()
    await fetch(`${BASE}/api/config`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current,
        requestVehicleTypes: [...current.requestVehicleTypes, { id: 'minibus', label: 'Minibus' }],
      }),
    })

    // The rate limit from the earlier suite may still apply; either the type
    // is accepted, or the request is throttled — never rejected as unknown.
    const res = await submitRequest(submission({ vehicles: [{ type: 'minibus', driverRequired: false }] }))
    expect([201, 429]).toContain(res.status)
    if (res.status === 400) expect((await res.json()).code).not.toBe('validation.invalidNested')
  })
})

// ── Accounts and roles ──

async function createAccount(payload) {
  return fetch(`${BASE}/api/users`, {
    method: 'PUT'.replace('PUT', 'POST'),
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('accounts', () => {
  let soldierToken

  it('starts with the bootstrapped administrator only', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ username: 'admin', role: 'admin' })
  })

  it('never exposes the stored secrets', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    for (const user of users) {
      expect(user).not.toHaveProperty('salt')
      expect(user).not.toHaveProperty('digest')
    }
  })

  it('creates an ordinary account', async () => {
    const res = await createAccount({ username: 'amuller', password: 'motdepasse1', role: 'user' })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ username: 'amuller', role: 'user' })
  })

  it('refuses a duplicate username', async () => {
    const res = await createAccount({ username: 'amuller', password: 'motdepasse2' })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('users.usernameTaken')
  })

  it('refuses a malformed username', async () => {
    expect((await (await createAccount({ username: 'A Muller', password: 'motdepasse1' })).json()).code)
      .toBe('users.invalidUsername')
  })

  it('accepts a short password, and refuses only an empty one', async () => {
    expect((await createAccount({ username: 'cfavre', password: 'x' })).status).toBe(201)
    expect((await (await createAccount({ username: 'jrossier', password: '' })).json()).code)
      .toBe('users.passwordEmpty')
  })

  it('lets the new account sign in', async () => {
    const res = await signIn('motdepasse1', 'amuller')
    expect(res.status).toBe(200)
    const body = await res.json()
    soldierToken = body.token
    expect(body.user.role).toBe('user')
  })

  it('keeps accounts and configuration out of an ordinary account\'s reach', async () => {
    const asSoldier = { Authorization: `Bearer ${soldierToken}` }
    expect((await fetch(`${BASE}/api/users`, { headers: asSoldier })).status).toBe(403)

    const config = await fetch(`${BASE}/api/config`, {
      method: 'PUT',
      headers: { ...asSoldier, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(config.status).toBe(403)
    expect((await config.json()).code).toBe('auth.adminOnly')
  })

  it('still lets an ordinary account manage the fleet', async () => {
    const asSoldier = { Authorization: `Bearer ${soldierToken}` }
    expect((await fetch(`${BASE}/api/missions`, { headers: asSoldier })).status).toBe(200)
    expect((await fetch(`${BASE}/api/requests`, { headers: asSoldier })).status).toBe(200)
  })

  it('ends every session of an account when its password is reset', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    const soldier = users.find(user => user.username === 'amuller')

    const res = await fetch(`${BASE}/api/users/${soldier.id}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nouveaumotdepasse' }),
    })
    expect(res.status).toBe(200)

    expect((await fetch(`${BASE}/api/missions`, {
      headers: { Authorization: `Bearer ${soldierToken}` },
    })).status).toBe(401)
    expect((await signIn('nouveaumotdepasse', 'amuller')).status).toBe(200)
  })

  it('refuses to remove the last administrator', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    const administrator = users.find(user => user.username === 'admin')

    const demotion = await fetch(`${BASE}/api/users/${administrator.id}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    })
    expect(demotion.status).toBe(409)
    expect((await demotion.json()).code).toBe('users.lastAdmin')
  })

  it('refuses to delete one\'s own account', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    const administrator = users.find(user => user.username === 'admin')

    const res = await fetch(`${BASE}/api/users/${administrator.id}`, { method: 'DELETE', headers: auth() })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('users.selfDelete')
  })

  it('deletes an account and kills its sessions', async () => {
    const created = await (await createAccount({ username: 'temporaire', password: 'motdepasse1' })).json()
    const token = (await (await signIn('motdepasse1', 'temporaire')).json()).token
    expect((await fetch(`${BASE}/api/missions`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)

    expect((await fetch(`${BASE}/api/users/${created.id}`, { method: 'DELETE', headers: auth() })).status).toBe(200)
    expect((await fetch(`${BASE}/api/missions`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401)
  })
})

// ── Rights ──
// Everything here is enforced on the server: hiding a button in the browser
// is a courtesy, not a right.

describe('rights', () => {
  let workerToken
  let workerId
  const asWorker = () => ({ Authorization: `Bearer ${workerToken}` })

  const fleet = [{
    id: 'v1', name: 'Duro', plate: 'M1', category: 'medium', seats: 8,
    status: 'free', loanNote: '', loanUntil: '', checks: [], keyHolder: null, keyHistory: [],
  }]

  async function currentFleet() {
    const res = await get('vehicles')
    return { data: await res.json(), version: versionFrom(res) }
  }

  it('creates an account that manages nothing', async () => {
    const created = await createAccount({ username: 'sdtworker', password: 'x', role: 'user' })
    expect(created.status).toBe(201)
    const account = await created.json()
    workerId = account.id
    expect(account.permissions).toEqual({})

    workerToken = (await (await signIn('x', 'sdtworker')).json()).token
    await put('vehicles', fleet)
  })

  it('lets it take a key on a vehicle it does not manage', async () => {
    const res = await fetch(`${BASE}/api/vehicles/v1/key`, {
      method: 'POST', headers: { ...asWorker(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ holder: { personId: null, name: 'Sdt Worker' } }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).vehicle.keyHolder).toMatchObject({ name: 'Sdt Worker', recordedBy: 'sdtworker' })
  })

  it('lets it record a weekly check', async () => {
    const res = await fetch(`${BASE}/api/vehicles/v1/checks`, {
      method: 'POST', headers: { ...asWorker(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-04', note: 'Atelier' }),
    })
    expect(res.status).toBe(200)
  })

  it('refuses the same key movement sent as part of the whole fleet', async () => {
    const { data, version } = await currentFleet()
    data[0].keyHolder = null
    const res = await put('vehicles', data, { version, headers: asWorker() })
    expect(res.status).toBe(403)
    expect((await res.json()).params.field).toBe('keyHolder')
  })

  it('refuses to lend the vehicle out, which commits the company', async () => {
    const { data, version } = await currentFleet()
    data[0].status = 'on-loan'
    data[0].loanNote = 'cp EM'
    const res = await put('vehicles', data, { version, headers: asWorker() })
    expect(res.status).toBe(403)
    expect((await res.json()).params.field).toBe('status')
  })

  it('refuses to decide a request', async () => {
    const decided = await fetch(`${BASE}/api/requests/whatever/status`, {
      method: 'PUT',
      headers: { ...asWorker(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(decided.status).toBe(403)
    expect((await decided.json()).code).toBe('permissions.denied')
  })

  it('refuses a change of identity, and says which field', async () => {
    const { data, version } = await currentFleet()
    data[0].plate = 'M999'
    const res = await put('vehicles', data, { version, headers: asWorker() })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      code: 'permissions.edited', params: { entity: 'vehicles', field: 'plate' },
    })
  })

  it('refuses a creation and a deletion', async () => {
    const { data, version } = await currentFleet()
    const added = await put('vehicles', [...data, { ...fleet[0], id: 'v2', plate: 'M2' }],
      { version, headers: asWorker() })
    expect(added.status).toBe(403)
    expect((await added.json()).code).toBe('permissions.created')

    const removed = await put('vehicles', [], { version, headers: asWorker() })
    expect(removed.status).toBe(403)
    expect((await removed.json()).code).toBe('permissions.deleted')
  })

  it('keeps the stored data untouched by a refused write', async () => {
    const { data } = await currentFleet()
    expect(data).toHaveLength(1)
    expect(data[0].plate).toBe('M1')
  })

  it('refuses giving a person a login, which is managing that person', async () => {
    const res = await fetch(`${BASE}/api/persons/p1/account`, {
      method: 'PUT',
      headers: { ...asWorker(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'x', lastName: 'Müller' }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('permissions.denied')
  })

  it('refuses laying out the park plan', async () => {
    const res = await fetch(`${BASE}/api/parc`, {
      method: 'PUT',
      headers: { ...asWorker(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones: [] }),
    })
    expect(res.status).toBe(403)
  })

  it('accepts the same writes once the right is granted', async () => {
    const granted = await fetch(`${BASE}/api/users/${workerId}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { 'vehicles.manage': true } }),
    })
    expect(granted.status).toBe(200)
    expect((await granted.json()).permissions).toEqual({ 'vehicles.manage': true })

    // Granting a right does not end the session; it widens it.
    const { data, version } = await currentFleet()
    data[0].plate = 'M999'
    expect((await put('vehicles', data, { version, headers: asWorker() })).status).toBe(200)
  })

  it('still refuses what was not granted', async () => {
    const { data, version } = await currentFleet()
    const persons = await put('persons', [person()], { version: '*', headers: asWorker() })
    expect(persons.status).toBe(403)
    expect(data[0].plate).toBe('M999')
    expect(version).toBeDefined()
  })

  it('drops an invented right rather than storing it', async () => {
    const res = await fetch(`${BASE}/api/users/${workerId}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { 'vehicles.manage': true, 'secrets.read': true } }),
    })
    expect((await res.json()).permissions).toEqual({ 'vehicles.manage': true })
  })

  it('leaves the administrator able to do everything', async () => {
    const { data, version } = await currentFleet()
    expect((await put('vehicles', [...data, { ...fleet[0], id: 'v3', plate: 'M3' }],
      { version })).status).toBe(200)
  })
})

describe('accounts holding rights', () => {
  let plannerToken
  let adminId
  const asPlanner = () => ({ Authorization: `Bearer ${plannerToken}` })
  const setPersonPassword = (personId, body) => fetch(`${BASE}/api/persons/${personId}/account`, {
    method: 'PUT',
    headers: { ...asPlanner(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('sets up an account that may only manage persons', async () => {
    const created = await createAccount({
      username: 'planner', password: 'p', role: 'user', permissions: { 'persons.manage': true },
    })
    expect(created.status).toBe(201)
    plannerToken = (await (await signIn('p', 'planner')).json()).token

    const users = await (await fetch(`${BASE}/api/users`, { headers: auth() })).json()
    adminId = users.find(user => user.username === 'admin').id
    // The administrator is also a person of the company, with their own missions.
    await fetch(`${BASE}/api/users/${adminId}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: 'p-admin' }),
    })
  })

  it('cannot take over an administrator through the person form', async () => {
    const res = await setPersonPassword('p-admin', { password: 'stolen', lastName: 'Pirate' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('users.privilegedAccount')

    expect((await signIn('stolen', 'pirate')).status).toBe(401)
    expect((await fetch(`${BASE}/api/auth/me`, { headers: auth() })).status).toBe(200)
  })

  it('cannot remove the account of an administrator either', async () => {
    const res = await fetch(`${BASE}/api/persons/p-admin/account`, { method: 'DELETE', headers: asPlanner() })
    expect(res.status).toBe(403)
  })

  it('still gives a plain soldier a password', async () => {
    expect((await setPersonPassword('p-soldier', { password: 's', lastName: 'Rossier' })).status).toBe(201)
    expect((await setPersonPassword('p-soldier', { password: 's2', lastName: 'Rossier' })).status).toBe(200)
  })

  it('leaves the administrator free to do it', async () => {
    const res = await fetch(`${BASE}/api/persons/p-soldier/account`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 's3', lastName: 'Rossier' }),
    })
    expect(res.status).toBe(200)

    await fetch(`${BASE}/api/users/${adminId}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: null }),
    })
  })
})

describe('counter actions on one vehicle', () => {
  let clerkToken
  let clerkId
  let otherToken
  const as = session => ({ Authorization: `Bearer ${session}` })
  const post = (path, body, session = clerkToken) => fetch(`${BASE}/api${path}`, {
    method: 'POST', headers: { ...as(session), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  // Written by an older version: no key, no checks, no return date.
  const legacy = { id: 'vs1', name: 'VW', plate: 'M77', seats: 9, category: 'light-road', status: 'free', loanNote: '' }

  async function fleet() {
    const res = await get('vehicles')
    return { data: await res.json(), version: versionFrom(res) }
  }
  const mine = data => data.find(item => item.id === legacy.id)

  it('sets up two accounts without any right, and a vehicle from an older version', async () => {
    const created = await createAccount({ username: 'clerk', password: 'c', role: 'user' })
    clerkId = (await created.json()).id
    await createAccount({ username: 'other', password: 'o', role: 'user' })
    clerkToken = (await (await signIn('c', 'clerk')).json()).token
    otherToken = (await (await signIn('o', 'other')).json()).token
    const { data, version } = await fleet()
    expect((await put('vehicles', [...data, legacy], { version })).status).toBe(200)
  })

  it('lets a plain account take a key on it, whatever its copy filled in', async () => {
    const res = await post(`/vehicles/${legacy.id}/key`, { holder: { personId: null, name: 'Sdt Clerk' } })
    expect(res.status).toBe(200)
  })

  it('needs no version: somebody else saving meanwhile changes nothing', async () => {
    const { data, version } = await fleet()
    expect((await put('vehicles', data.map(v => v.id === legacy.id ? v : { ...v, seats: (v.seats ?? 0) + 1 }), { version })).status).toBe(200)
    expect((await post(`/vehicles/${legacy.id}/key`, { holder: null })).status).toBe(200)
  })

  it('says who recorded a movement and when, ignoring what the client claims', async () => {
    await post(`/vehicles/${legacy.id}/key`, { holder: { personId: null, name: 'Sdt Clerk' }, recordedBy: 'Cdt X', at: '2020-01-01T03:00' })
    const stored = mine((await fleet()).data)
    const last = stored.keyHistory.at(-1)
    expect(last).toMatchObject({ recordedBy: 'clerk', action: 'taken' })
    expect(last.at).not.toBe('2020-01-01T03:00')
    expect(stored.keyHolder).toMatchObject({ recordedBy: 'clerk', since: last.at })

    const journal = await (await fetch(`${BASE}/api/journal`, { headers: auth() })).json()
    expect(journal.entries.find(entry => entry.id === last.id)).toMatchObject({ recordedBy: 'clerk' })
  })

  it('names a declared person by their record', async () => {
    await put('persons', [person({ id: 'pk', lastName: 'Favre', firstName: 'Caroline', rank: 'Sgt' })], { version: '*' })
    const res = await post(`/vehicles/${legacy.id}/key`, { holder: { personId: 'pk', name: 'Somebody else' } })
    expect((await res.json()).vehicle.keyHolder).toMatchObject({ personId: 'pk', name: 'Sgt Caroline Favre' })
  })

  it('refuses a movement that makes no sense, and says why', async () => {
    const same = await post(`/vehicles/${legacy.id}/key`, { holder: { personId: 'pk', name: '' } })
    expect(same.status).toBe(409)
    expect((await same.json()).code).toBe('keys.sameHolder')
    await post(`/vehicles/${legacy.id}/key`, { holder: null })
    const again = await post(`/vehicles/${legacy.id}/key`, { holder: null })
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('keys.alreadyIn')
  })

  it('refuses to move a key the screen saw somewhere it no longer is', async () => {
    // Counter B took it; counter A still shows it on the board.
    await post(`/vehicles/${legacy.id}/key`, { holder: { personId: null, name: 'Counter B' }, expected: null })
    const stale = await post(`/vehicles/${legacy.id}/key`, { holder: { personId: null, name: 'Counter A' }, expected: null })
    expect(stale.status).toBe(409)
    expect((await stale.json()).code).toBe('keys.moved')
    const current = await post(`/vehicles/${legacy.id}/key`, { holder: null, expected: { personId: null, name: 'Counter B' } })
    expect(current.status).toBe(200)
  })

  it('stamps the author of a check', async () => {
    const res = await post(`/vehicles/${legacy.id}/checks`, { date: '2026-10-09', note: 'Atelier', recordedBy: 'Cdt X' })
    expect((await res.json()).vehicle.checks.at(-1)).toMatchObject({ recordedBy: 'clerk', recordedById: clerkId })
  })

  it('refuses to let another plain account withdraw that check', async () => {
    const check = mine((await fleet()).data).checks.at(-1)
    const res = await fetch(`${BASE}/api/vehicles/${legacy.id}/checks/${check.id}`, { method: 'DELETE', headers: as(otherToken) })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'permissions.checkRemoval', params: { plate: 'M77' } })
  })

  it('lets its author withdraw it', async () => {
    const check = mine((await fleet()).data).checks.at(-1)
    const res = await fetch(`${BASE}/api/vehicles/${legacy.id}/checks/${check.id}`, { method: 'DELETE', headers: as(clerkToken) })
    expect(res.status).toBe(200)
    expect(mine((await fleet()).data).checks).toEqual([])
  })

  it('does not mistake defaults filled in by the interface for a change', async () => {
    const res = await get('vehicles')
    const version = versionFrom(res)
    // What the interface holds after reading the fleet: every field present.
    const { migrateVehicles } = await import('../src/migrations.js')
    const asShown = migrateVehicles(await res.json())
    expect((await put('vehicles', asShown, { version, headers: as(clerkToken) })).status).toBe(200)
  })
})

describe('missions that name nothing real', () => {
  it('refuses a vehicle that does not exist', async () => {
    const res = await put('missions', [{ id: 'mx', title: 'Fantôme', vehicles: [{ vehicleId: 'ghost' }], staffIds: [] }])
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation.unknownReference', params: { field: 'vehicleId' } })
  })
})

describe('security headers', () => {
  it('forbids framing and foreign scripts', async () => {
    const res = await fetch(`${BASE}/api/config`)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })
})

describe('own password', () => {
  it('refuses a wrong current password', async () => {
    const res = await fetch(`${BASE}/api/auth/password`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'nouveaumotdepasse' }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('auth.wrongCurrentPassword')
  })

  it('changes it and returns a usable token', async () => {
    const res = await fetch(`${BASE}/api/auth/password`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'admin-nouveau' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)

    // The old token is gone, the new one works, and the new password is live.
    expect((await fetch(`${BASE}/api/users`, { headers: auth() })).status).toBe(401)
    expect((await fetch(`${BASE}/api/users`, {
      headers: { Authorization: `Bearer ${body.token}` },
    })).status).toBe(200)
    expect((await signIn('admin-nouveau')).status).toBe(200)

    token = body.token // keep the suite usable afterwards
  })
})

// ── Static files and the single-page fallback ──

describe('serving the frontend', () => {
  it('answers 404 for a file that does not exist, not the application', async () => {
    const res = await fetch(`${BASE}/assets/does-not-exist.js`, {
      headers: { Accept: '*/*' },
    })
    expect(res.status).toBe(404)
    // Returning index.html here would have the browser parse HTML as
    // JavaScript, and a cache in front would store it under that URL.
    expect(res.headers.get('content-type')).not.toContain('text/html')
  })

  it('answers 404 for a missing icon', async () => {
    expect((await fetch(`${BASE}/vite.svg`)).status).toBe(404)
  })

  it('refuses a non-navigation request for an unknown path', async () => {
    const res = await fetch(`${BASE}/whatever`, { headers: { Accept: 'application/json' } })
    expect(res.status).toBe(404)
  })

  it('still answers on an unknown /api route with a JSON error', async () => {
    const res = await fetch(`${BASE}/api/nope`, { headers: auth() })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('notFound')
  })
})

// ── Brute force ──
// Kept last on purpose: these tests exhaust the login budget for this client,
// so anything signing in afterwards would be throttled.

describe('login throttling', () => {
  it('blocks repeated wrong passwords and says how long to wait', async () => {
    let blocked = null
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await signIn(`wrong-${attempt}`)
      if (res.status === 429) { blocked = res; break }
      expect(res.status).toBe(401)
    }
    expect(blocked).not.toBeNull()

    const body = await blocked.json()
    expect(body.code).toBe('tooManyAttempts')
    expect(body.params.seconds).toBeGreaterThan(0)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('refuses the right password too once the budget is spent', async () => {
    // The previous test exhausted the budget for this client.
    expect((await signIn()).status).toBe(429)
  })
})
