/**
 * Demonstration data seeding.
 *
 * The sample set is dated once and for all; without re-anchoring, an install
 * done six months later would show nothing but completed missions — an empty
 * dashboard and an empty calendar. Every date is therefore shifted by a whole
 * number of days so the covered period straddles the installation day, while
 * times of day are preserved.
 */

const DAY_MS = 24 * 60 * 60 * 1000
// Both shapes occur: mission bounds and leaves carry a time, weekly checks
// and loan deadlines are bare dates. Both have to be re-anchored.
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isDateLike(value) {
  return DATE_TIME_PATTERN.test(value) || DATE_PATTERN.test(value)
}

const pad = n => String(n).padStart(2, '0')

function toDate(str) {
  const [date, time = '00:00'] = str.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Renders back in the shape it came in: with a time, or without. */
function toString_(d, withTime) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

/** Every date string found anywhere in a structure */
function collectDates(value, acc = []) {
  if (typeof value === 'string') {
    if (isDateLike(value)) acc.push(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collectDates(v, acc)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectDates(v, acc)
  }
  return acc
}

/** Deep copy with every date shifted by `days` days */
function shift(value, days) {
  if (typeof value === 'string') {
    if (!isDateLike(value)) return value
    const d = toDate(value)
    d.setDate(d.getDate() + days)
    return toString_(d, DATE_TIME_PATTERN.test(value))
  }
  if (Array.isArray(value)) return value.map(v => shift(v, days))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, days)]))
  }
  return value
}

/**
 * Shift needed for the midpoint of the covered period to land on `reference`.
 * @returns {number} whole number of days, 0 when there is no date at all
 */
export function computeShift(collections, reference = new Date()) {
  const dates = Object.values(collections).flatMap(c => collectDates(c))
  if (!dates.length) return 0

  const bounds = dates.map(d => toDate(d).getTime())
  const midpoint = new Date((Math.min(...bounds) + Math.max(...bounds)) / 2)

  const atMidnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((atMidnight(reference) - atMidnight(midpoint)) / DAY_MS)
}

/**
 * Re-anchors a set of collections on the reference date.
 * @param collections {{[entity: string]: Array}}
 * @returns {{[entity: string]: Array}} new collections
 */
export function reanchor(collections, reference = new Date()) {
  const days = computeShift(collections, reference)
  if (days === 0) return collections
  return Object.fromEntries(
    Object.entries(collections).map(([name, data]) => [name, shift(data, days)]),
  )
}
