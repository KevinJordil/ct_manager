/**
 * Weekly vehicle checks (SPH — "service de parc hebdomadaire").
 *
 * Each vehicle carries a list of dated records. What matters operationally is
 * how long ago the last one was: a vehicle checked more than a week ago, or
 * never checked at all, has to be dealt with first.
 */

import { parseLocal, todayString } from './datetime.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** A check is due again after this many days. */
export const CHECK_INTERVAL_DAYS = 7

export const CHECK_STATUS = {
  NEVER: 'never',
  OK: 'ok',
  DUE: 'due',
  OVERDUE: 'overdue',
}

/** Most recent check, or null */
export function lastCheck(vehicle) {
  if (!vehicle.checks?.length) return null
  return [...vehicle.checks].sort((a, b) => b.date.localeCompare(a.date))[0]
}

/** Checks from the most recent to the oldest */
export function checkHistory(vehicle) {
  return [...(vehicle.checks ?? [])].sort((a, b) => b.date.localeCompare(a.date))
}

/** Whole days since the last check, or null when there has never been one */
export function daysSinceLastCheck(vehicle, today = todayString()) {
  const last = lastCheck(vehicle)
  if (!last) return null
  const elapsed = parseLocal(today) - parseLocal(last.date)
  return Math.floor(elapsed / DAY_MS)
}

/** never | ok | due | overdue */
export function checkStatus(vehicle, today = todayString()) {
  const days = daysSinceLastCheck(vehicle, today)
  if (days === null) return CHECK_STATUS.NEVER
  if (days < CHECK_INTERVAL_DAYS) return CHECK_STATUS.OK
  if (days === CHECK_INTERVAL_DAYS) return CHECK_STATUS.DUE
  return CHECK_STATUS.OVERDUE
}

export function needsCheck(vehicle, today = todayString()) {
  return checkStatus(vehicle, today) !== CHECK_STATUS.OK
}

/**
 * Vehicles ordered by urgency: never checked first, then by how long ago the
 * last check was.
 */
export function byCheckUrgency(vehicles, today = todayString()) {
  return [...vehicles]
    .map(vehicle => ({ vehicle, days: daysSinceLastCheck(vehicle, today) }))
    .sort((a, b) => {
      if (a.days === null && b.days === null) return 0
      if (a.days === null) return -1
      if (b.days === null) return 1
      return b.days - a.days
    })
}
