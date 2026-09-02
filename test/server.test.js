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

async function signIn(password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res
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
    expect((await res.json()).code).toBe('auth.invalidPassword')
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
