/**
 * Local-time date helpers.
 *
 * The whole application stores dates as naive local strings ("YYYY-MM-DD" or
 * "YYYY-MM-DDTHH:mm"), exactly the format produced by <input type="date"> and
 * <input type="datetime-local">. Such strings compare correctly with < and >.
 *
 * `Date.prototype.toISOString()` converts to UTC: using it to build one of
 * these strings shifts the result by one or two hours — and therefore
 * sometimes by a whole day. No helper here uses it.
 */

const pad = n => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DD" (local) */
export function toDateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → "YYYY-MM-DDTHH:mm" (local) */
export function toDateTimeString(d) {
  return `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" → Date, read as local time */
export function parseLocal(str) {
  const [date, time = '00:00'] = str.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Today, as "YYYY-MM-DD" */
export function todayString() {
  return toDateString(new Date())
}

/** Now, as "YYYY-MM-DDTHH:mm" — comparable with the dates entered in the app */
export function nowString() {
  return toDateTimeString(new Date())
}

/** Adds N days to a "YYYY-MM-DD" date */
export function addDays(dateStr, n) {
  const d = parseLocal(dateStr)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

/**
 * Adds N months to a "YYYY-MM-DD" date, clamping to the last day of the
 * target month (31 January + 1 month → 28 February, not 3 March).
 */
export function addMonths(dateStr, n) {
  const d = parseLocal(dateStr)
  const dayOfMonth = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dayOfMonth, lastDay))
  return toDateString(d)
}

/** Monday of the week containing the "YYYY-MM-DD" date */
export function mondayOf(dateStr) {
  const d = parseLocal(dateStr)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return toDateString(d)
}

/** Do two [start, end] ranges overlap? Bounds are inclusive. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * "2026-04-28T09:00" → "28.04.2026 09:00"
 *
 * Day-first with dots is the common written form in all three supported
 * languages, so it needs no locale switch.
 */
export function formatDateTime(dt) {
  if (!dt) return '—'
  const [date, time] = dt.split('T')
  const [y, m, d] = date.split('-')
  return time ? `${d}.${m}.${y} ${time}` : `${d}.${m}.${y}`
}

/** Appends "T<defaultTime>" when the time part is missing */
export function withDefaultTime(dt, defaultTime = '00:00') {
  if (!dt) return dt
  return dt.includes('T') ? dt : `${dt}T${defaultTime}`
}
