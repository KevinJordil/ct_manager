/**
 * Validation des collections reçues par l'API.
 *
 * Le serveur remplace le fichier entier à chaque PUT : sans validation, une
 * requête malformée (ou un bug client) détruit silencieusement les données.
 */

const MAX_ITEMS = 5000
const MAX_TEXTE = 5000

const estTexte = v => typeof v === 'string' && v.length <= MAX_TEXTE
const estTexteOuVide = v => v === undefined || v === null || estTexte(v)
const estBooleen = v => v === undefined || typeof v === 'boolean'
const estDate = v => v === undefined || v === null || v === '' ||
  (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v))
const estListeDeTextes = v => v === undefined || (Array.isArray(v) && v.every(estTexte))

const CATEGORIES = ['léger-route', 'léger-tt', 'moyen', 'lourd']
const STATUTS_VEHICULE = ['libre', 'en prêt']

/** @returns {string|null} message d'erreur, ou null si l'objet est valide */
function valideCommun(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return 'objet attendu'
  if (!estTexte(item.id) || item.id === '') return 'champ "id" manquant ou invalide'
  return null
}

function validePerson(p) {
  const base = valideCommun(p)
  if (base) return base
  if (!estTexte(p.nom)) return 'champ "nom" invalide'
  if (!estTexte(p.prenom)) return 'champ "prenom" invalide'
  if (!estTexteOuVide(p.grade)) return 'champ "grade" invalide'
  if (!estTexteOuVide(p.notes)) return 'champ "notes" invalide'
  if (!estListeDeTextes(p.permis)) return 'champ "permis" invalide'
  if (!estBooleen(p.indisponible)) return 'champ "indisponible" invalide'
  if (!estTexteOuVide(p.commentaireIndisponible)) return 'champ "commentaireIndisponible" invalide'
  if (p.conges !== undefined) {
    if (!Array.isArray(p.conges)) return 'champ "conges" invalide'
    for (const [i, c] of p.conges.entries()) {
      if (c === null || typeof c !== 'object') return `conges[${i}] : objet attendu`
      if (!estTexte(c.id)) return `conges[${i}] : "id" invalide`
      if (!estDate(c.dateDebut) || !estDate(c.dateFin)) return `conges[${i}] : dates invalides`
    }
  }
  return null
}

function valideVehicle(v) {
  const base = valideCommun(v)
  if (base) return base
  if (!estTexte(v.nom)) return 'champ "nom" invalide'
  if (!estTexteOuVide(v.immatriculation)) return 'champ "immatriculation" invalide'
  if (v.categorie !== undefined && !CATEGORIES.includes(v.categorie)) return 'champ "categorie" inconnu'
  if (v.statut !== undefined && !STATUTS_VEHICULE.includes(v.statut)) return 'champ "statut" inconnu'
  if (!estTexteOuVide(v.commentairePret)) return 'champ "commentairePret" invalide'
  if (v.places !== undefined && (!Number.isInteger(v.places) || v.places < 0 || v.places > 200)) {
    return 'champ "places" invalide'
  }
  return null
}

function valideMission(m) {
  const base = valideCommun(m)
  if (base) return base
  if (!estTexte(m.titre)) return 'champ "titre" invalide'
  if (!estTexteOuVide(m.description)) return 'champ "description" invalide'
  if (!estTexteOuVide(m.notes)) return 'champ "notes" invalide'
  if (!estDate(m.dateDebut) || !estDate(m.dateFin)) return 'dates invalides'
  if (m.vehicules !== undefined) {
    if (!Array.isArray(m.vehicules)) return 'champ "vehicules" invalide'
    for (const [i, v] of m.vehicules.entries()) {
      if (v === null || typeof v !== 'object') return `vehicules[${i}] : objet attendu`
      if (!estTexte(v.vehiculeId)) return `vehicules[${i}] : "vehiculeId" invalide`
      if (v.chauffeurId !== null && v.chauffeurId !== undefined && !estTexte(v.chauffeurId)) {
        return `vehicules[${i}] : "chauffeurId" invalide`
      }
      if (!estBooleen(v.avecRemorque)) return `vehicules[${i}] : "avecRemorque" invalide`
    }
  }
  if (!estListeDeTextes(m.personnes)) return 'champ "personnes" invalide'
  return null
}

const VALIDATEURS = {
  persons: validePerson,
  vehicles: valideVehicle,
  missions: valideMission,
}

export const ENTITES = Object.keys(VALIDATEURS)

/**
 * Valide une collection complète.
 * @returns {string|null} message d'erreur, ou null si tout est valide
 */
export function valideCollection(entity, data) {
  const validateur = VALIDATEURS[entity]
  if (!validateur) return `collection inconnue : ${entity}`
  if (!Array.isArray(data)) return 'tableau attendu'
  if (data.length > MAX_ITEMS) return `trop d'éléments (max ${MAX_ITEMS})`

  const vus = new Set()
  for (const [i, item] of data.entries()) {
    const erreur = validateur(item)
    if (erreur) return `élément ${i} : ${erreur}`
    if (vus.has(item.id)) return `élément ${i} : identifiant en double (${item.id})`
    vus.add(item.id)
  }
  return null
}
