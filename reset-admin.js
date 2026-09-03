#!/usr/bin/env node
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROLES, hashPassword, validatePassword } from './users.js'

/**
 * Recovery command, to be run on the server.
 *
 * Resets the password of an administrator account — or recreates one if none
 * is left — without touching the other accounts. The only alternative was to
 * delete users.json, which wiped every account.
 *
 *   npm run reset-admin                 → "admin", generated password
 *   npm run reset-admin -- cfavre       → that account, generated password
 *   npm run reset-admin -- cfavre mypw  → that account, chosen password
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

const [username = 'admin', chosen] = process.argv.slice(2)

async function readUsers() {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf-8'))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function main() {
  const password = chosen ?? crypto.randomBytes(9).toString('base64url')
  if (!password) {
    console.error('The password cannot be empty.')
    process.exit(1)
  }
  // The length rule guards the forms; this command runs on the server, where
  // a short password is a deliberate choice — warned about, not refused.
  const weak = validatePassword(password)
  if (weak) {
    console.warn(`⚠  Shorter than the ${weak.params.min} characters the interface requires.`)
    console.warn('   Fine for a development machine, not for anything reachable.')
  }

  const users = await readUsers()
  const index = users.findIndex(user => user.username === username)

  if (index === -1) {
    users.push({
      id: crypto.randomUUID(),
      username,
      role: ROLES.ADMIN,
      personId: null,
      createdAt: new Date().toISOString().slice(0, 16),
      ...hashPassword(password),
    })
    console.log(`Account "${username}" created as an administrator.`)
  } else {
    // A recovery that left the account without its rights would be useless.
    users[index] = { ...users[index], role: ROLES.ADMIN, ...hashPassword(password) }
    console.log(`Password of "${username}" reset; the account is an administrator.`)
  }

  await fs.mkdir(DATA_DIR, { recursive: true })
  const tmp = `${USERS_FILE}.tmp`
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), 'utf-8')
  await fs.rename(tmp, USERS_FILE)

  console.log(`Password: ${password}`)
  console.log('Every session of this account has been left untouched on a running server;')
  console.log('restart it, or sign out and back in.')
}

main().catch(error => {
  console.error('Reset failed:', error.message)
  process.exit(1)
})
