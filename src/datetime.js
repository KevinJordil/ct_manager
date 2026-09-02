/**
 * Helpers de date en **heure locale**.
 *
 * Toute l'application stocke ses dates sous forme de chaînes naïves locales
 * ("YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm"), exactement le format produit par les
 * <input type="date"> et <input type="datetime-local">. Ces chaînes se
 * comparent directement avec `<` et `>`.
 *
 * `Date.prototype.toISOString()` convertit en UTC : l'utiliser pour produire
 * une de ces chaînes décale le résultat d'une à deux heures — et donc parfois
 * d'un jour entier. Aucun helper d'ici ne l'utilise.
 */

const pad = n => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DD" (local) */
export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → "YYYY-MM-DDTHH:mm" (local) */
export function toDateTimeStr(d) {
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" → Date (interprétée en local) */
export function parseLocal(str) {
  const [date, time = '00:00'] = str.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Aujourd'hui, "YYYY-MM-DD" */
export function todayStr() {
  return toDateStr(new Date())
}

/** Maintenant, "YYYY-MM-DDTHH:mm" — à comparer aux dates saisies dans l'app */
export function nowStr() {
  return toDateTimeStr(new Date())
}

/** Ajoute N jours à une date "YYYY-MM-DD" */
export function addDays(dateStr, n) {
  const d = parseLocal(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/**
 * Ajoute N mois à une date "YYYY-MM-DD", en bornant au dernier jour du mois
 * cible (31 janvier + 1 mois → 28 février, et non 3 mars).
 */
export function addMonths(dateStr, n) {
  const d = parseLocal(dateStr)
  const jour = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const dernierJour = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(jour, dernierJour))
  return toDateStr(d)
}

/** Lundi de la semaine contenant la date "YYYY-MM-DD" */
export function mondayOf(dateStr) {
  const d = parseLocal(dateStr)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return toDateStr(d)
}

/** Deux intervalles [début, fin] se chevauchent-ils ? (bornes incluses) */
export function overlaps(aDebut, aFin, bDebut, bFin) {
  if (!aDebut || !aFin || !bDebut || !bFin) return false
  return aDebut <= bFin && bDebut <= aFin
}

/** "2026-04-28T09:00" → "28.04.2026 09:00" */
export function formatDT(dt) {
  if (!dt) return '—'
  const [date, time] = dt.split('T')
  const [y, m, d] = date.split('-')
  return time ? `${d}.${m}.${y} ${time}` : `${d}.${m}.${y}`
}

/** Ajoute "T<defaultTime>" si l'heure est absente */
export function addTimeIfMissing(dt, defaultTime = '00:00') {
  if (!dt) return dt
  return dt.includes('T') ? dt : `${dt}T${defaultTime}`
}
