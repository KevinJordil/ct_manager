/**
 * Locale-aware date names, taken from Intl rather than hard-coded lists —
 * that is what makes the calendar readable in all three languages.
 *
 * Weekday arrays are indexed like `Date.prototype.getDay()`, so index 0 is
 * Sunday.
 */

const REFERENCE_SUNDAY = new Date(2024, 0, 7) // a Sunday, to build weekday names

const cache = new Map()

function memoise(key, build) {
  if (!cache.has(key)) cache.set(key, build())
  return cache.get(key)
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** @param style 'short' | 'long' */
export function weekdayNames(tag, style = 'short') {
  return memoise(`weekday:${tag}:${style}`, () => {
    const format = new Intl.DateTimeFormat(tag, { weekday: style })
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(REFERENCE_SUNDAY)
      d.setDate(d.getDate() + i)
      return capitalise(format.format(d).replace(/\.$/, ''))
    })
  })
}

/** @param style 'short' | 'long' */
export function monthNames(tag, style = 'long') {
  return memoise(`month:${tag}:${style}`, () => {
    const format = new Intl.DateTimeFormat(tag, { month: style })
    return Array.from({ length: 12 }, (_, i) =>
      capitalise(format.format(new Date(2024, i, 1)).replace(/\.$/, '')))
  })
}

/** "Mercredi, 2 septembre 2026" */
export function formatLongDate(date, tag) {
  const formatted = new Intl.DateTimeFormat(tag, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date)
  return capitalise(formatted)
}

/** "10:17:41" */
export function formatClock(date, tag) {
  return new Intl.DateTimeFormat(tag, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}
