/**
 * What an account may do.
 *
 * Without any right, an account can do what a soldier does at the counter:
 * move keys — take one, pass it on, hang it up — and record a weekly check.
 * It can read everything else: missions, the park plan, the log of key
 * movements, the requests that came in.
 *
 * Everything that commits the company is granted account by account: saying
 * that somebody is away, lending a vehicle out, deciding a request, and of
 * course creating, changing or deleting any record. Nothing is granted by
 * default.
 *
 * Administrators hold every right, plus accounts and configuration, which
 * are not listed here because they are never granted separately.
 */

export const PERMISSIONS = [
  'persons.manage',
  'vehicles.manage',
  'missions.manage',
  'requests.manage',
  'park.manage',
]

const ADMIN = 'admin'

/** A new account manages nothing. */
export function defaultPermissions() {
  return {}
}

/** Keeps only known rights, as booleans. */
export function sanitisePermissions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const clean = {}
  for (const permission of PERMISSIONS) {
    if (input[permission] === true) clean[permission] = true
  }
  return clean
}

export function can(user, permission) {
  if (!user) return false
  if (user.role === ADMIN) return true
  return user.permissions?.[permission] === true
}

/**
 * Fields an account may change on a record it does not manage.
 *
 * On a vehicle: where its key is, and its weekly checks. Not its loan —
 * lending a vehicle out is a decision, not a movement — and not its
 * identity.
 *
 * On a person: nothing. Declaring somebody away is a statement about
 * somebody else's service, so it belongs with managing people.
 *
 * On a mission: nothing. It is planning through and through, so changing one
 * is managing it.
 */
export const INTERACTION_FIELDS = {
  vehicles: ['keyHolder', 'keyHistory', 'checks'],
  persons: [],
  missions: [],
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Compares a submitted collection against the stored one and reports the
 * first change the account is not allowed to make.
 *
 * The API saves whole collections, so this is where the right is enforced:
 * refusing the request outright would also block the key movements and the
 * checks that everybody may record.
 *
 * @returns {{code: string, params: object}|null} null when the change is allowed
 */
export function forbiddenChange(entity, before, after) {
  const allowed = INTERACTION_FIELDS[entity] ?? []
  const previous = new Map(before.map(item => [item.id, item]))

  for (const item of after) {
    const original = previous.get(item.id)
    if (!original) return { code: 'created', params: { entity } }

    for (const field of new Set([...Object.keys(original), ...Object.keys(item)])) {
      if (allowed.includes(field)) continue
      if (!sameValue(original[field], item[field])) {
        return { code: 'edited', params: { entity, field } }
      }
    }
    previous.delete(item.id)
  }

  if (previous.size > 0) return { code: 'deleted', params: { entity } }
  return null
}
