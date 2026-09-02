/**
 * Identifier generation.
 *
 * `Date.now()` is not enough: two records created within the same
 * millisecond (a loop, a double click) would share an identifier.
 */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
