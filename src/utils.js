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

/** Statut d'une mission calculé depuis ses dates */
export function getMissionStatut(mission) {
  if (!mission?.dateDebut || !mission?.dateFin) return 'planifiée'
  const now = new Date().toISOString().slice(0, 16)
  if (mission.dateFin < now) return 'terminée'
  if (mission.dateDebut <= now) return 'en cours'
  return 'planifiée'
}

/** Ajoute N jours à une date "YYYY-MM-DD" */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
