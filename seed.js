/**
 * Amorçage des données de démonstration.
 *
 * Le jeu d'exemple est daté une fois pour toutes ; sans recalage, une
 * installation faite six mois plus tard n'afficherait que des missions
 * terminées — tableau de bord vide, calendrier vide. On décale donc toutes
 * les dates d'un nombre entier de jours pour que la période couverte
 * enjambe le jour de l'installation, en conservant les heures.
 */

const JOUR_MS = 24 * 60 * 60 * 1000
const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const pad = n => String(n).padStart(2, '0')

function versDate(str) {
  const [date, heure] = str.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = heure.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

function versChaine(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Toutes les dates "YYYY-MM-DDTHH:mm" présentes dans une structure */
function collecterDates(valeur, acc = []) {
  if (typeof valeur === 'string') {
    if (MOTIF_DATE.test(valeur)) acc.push(valeur)
  } else if (Array.isArray(valeur)) {
    for (const v of valeur) collecterDates(v, acc)
  } else if (valeur && typeof valeur === 'object') {
    for (const v of Object.values(valeur)) collecterDates(v, acc)
  }
  return acc
}

/** Recopie la structure en décalant chaque date de `jours` jours */
function decaler(valeur, jours) {
  if (typeof valeur === 'string') {
    if (!MOTIF_DATE.test(valeur)) return valeur
    const d = versDate(valeur)
    d.setDate(d.getDate() + jours)
    return versChaine(d)
  }
  if (Array.isArray(valeur)) return valeur.map(v => decaler(v, jours))
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, decaler(v, jours)]))
  }
  return valeur
}

/**
 * Décalage à appliquer pour que le milieu de la période couverte par les
 * données tombe sur `reference`.
 * @returns {number} nombre entier de jours (0 si aucune date)
 */
export function calculerDecalage(collections, reference = new Date()) {
  const dates = collectionsVersDates(collections)
  if (!dates.length) return 0

  const bornes = dates.map(d => versDate(d).getTime())
  const milieu = new Date((Math.min(...bornes) + Math.max(...bornes)) / 2)

  const jour = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((jour(reference) - jour(milieu)) / JOUR_MS)
}

function collectionsVersDates(collections) {
  return Object.values(collections).flatMap(c => collecterDates(c))
}

/**
 * Recale un ensemble de collections sur la date de référence.
 * @param collections {{[entite: string]: Array}}
 * @returns {{[entite: string]: Array}} nouvelles collections
 */
export function recaler(collections, reference = new Date()) {
  const jours = calculerDecalage(collections, reference)
  if (jours === 0) return collections
  return Object.fromEntries(
    Object.entries(collections).map(([nom, données]) => [nom, decaler(données, jours)]),
  )
}
