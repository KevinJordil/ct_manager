/**
 * Règles métier de disponibilité — personnes, véhicules et statut des missions.
 *
 * Ces fonctions sont pures : l'instant de référence est toujours passé en
 * paramètre (`now`, au format "YYYY-MM-DDTHH:mm" local). Cela les rend
 * testables et permet aux composants de dépendre d'une horloge réactive
 * (voir `stores/clock.js`) plutôt que d'appeler `new Date()` dans un computed,
 * ce qui empêcherait Vue de recalculer les statuts au fil du temps.
 */

import { nowStr, overlaps } from './datetime.js'

// ── Missions ──

/** Statut d'une mission, calculé depuis ses dates */
export function getMissionStatut(mission, now = nowStr()) {
  if (!mission?.dateDebut || !mission?.dateFin) return 'planifiée'
  if (mission.dateFin < now) return 'terminée'
  if (mission.dateDebut <= now) return 'en cours'
  return 'planifiée'
}

export function missionsEnCours(missions, now = nowStr()) {
  return missions.filter(m => getMissionStatut(m, now) === 'en cours')
}

/** La mission engage-t-elle cette personne (comme chauffeur ou sans véhicule) ? */
export function missionEngagePersonne(mission, personId) {
  return Boolean(
    mission.vehicules?.some(v => v.chauffeurId === personId) ||
    mission.personnes?.includes(personId)
  )
}

/** La mission engage-t-elle ce véhicule ? */
export function missionEngageVehicule(mission, vehiculeId) {
  return Boolean(mission.vehicules?.some(v => v.vehiculeId === vehiculeId))
}

// ── Congés / indisponibilité ──

/** La personne est-elle en congé à un instant donné ? */
export function isEnCongeA(person, now = nowStr()) {
  return Boolean(person.conges?.some(c => c.dateDebut <= now && now <= c.dateFin))
}

/** La personne a-t-elle un congé qui chevauche la période ? */
export function isEnCongePendant(person, dateDebut, dateFin) {
  if (!dateDebut || !dateFin || !person.conges?.length) return false
  return person.conges.some(c => overlaps(c.dateDebut, c.dateFin, dateDebut, dateFin))
}

/** Statut de base d'une personne : disponible | en congé | indisponible */
export function getPersonStatut(person, now = nowStr()) {
  if (person.indisponible) return 'indisponible'
  return isEnCongeA(person, now) ? 'en congé' : 'disponible'
}

// ── Engagement sur une période ──

/**
 * Missions qui chevauchent la période donnée.
 * `excludeMissionId` sert à ignorer la mission en cours d'édition.
 */
export function missionsChevauchant(missions, dateDebut, dateFin, { excludeMissionId = null } = {}) {
  return missions.filter(m =>
    m.id !== excludeMissionId && overlaps(m.dateDebut, m.dateFin, dateDebut, dateFin)
  )
}

/** La personne est-elle déjà engagée sur une mission chevauchant la période ? */
export function isPersonneEngagee(personId, missions, dateDebut, dateFin, options = {}) {
  return missionsChevauchant(missions, dateDebut, dateFin, options)
    .some(m => missionEngagePersonne(m, personId))
}

/** Le véhicule est-il déjà engagé sur une mission chevauchant la période ? */
export function isVehiculeEngage(vehiculeId, missions, dateDebut, dateFin, options = {}) {
  return missionsChevauchant(missions, dateDebut, dateFin, options)
    .some(m => missionEngageVehicule(m, vehiculeId))
}

// ── Statuts « affichés », qui tiennent compte des missions en cours ──

/** Mission actuellement en cours qui engage cette personne, ou undefined */
export function missionActuelleDePersonne(personId, missions, now = nowStr()) {
  return missionsEnCours(missions, now).find(m => missionEngagePersonne(m, personId))
}

/** Mission actuellement en cours qui engage ce véhicule, ou undefined */
export function missionActuelleDeVehicule(vehiculeId, missions, now = nowStr()) {
  return missionsEnCours(missions, now).find(m => missionEngageVehicule(m, vehiculeId))
}

/** disponible | en mission | en congé | indisponible */
export function getPersonStatutAffiche(person, missions, now = nowStr()) {
  const base = getPersonStatut(person, now)
  if (base !== 'disponible') return base
  return missionActuelleDePersonne(person.id, missions, now) ? 'en mission' : 'disponible'
}

/** libre | en mission | en prêt */
export function getVehiculeStatut(vehicule, missions, now = nowStr()) {
  if (vehicule.statut === 'en prêt') return 'en prêt'
  return missionActuelleDeVehicule(vehicule.id, missions, now) ? 'en mission' : 'libre'
}

// ── Disponibilité pour l'affectation à une mission ──

/**
 * La personne peut-elle être affectée à une mission sur cette période ?
 * `excludeMissionId` : mission en cours d'édition, dont les affectations
 * actuelles ne doivent pas compter comme un conflit.
 */
export function personneDisponible(person, missions, dateDebut, dateFin, options = {}) {
  const { excludeMissionId = null, now = nowStr() } = options
  if (person.indisponible) return false
  if (!dateDebut || !dateFin) return !isEnCongeA(person, now)
  if (isEnCongePendant(person, dateDebut, dateFin)) return false
  // Une mission déjà terminée ne mobilise plus personne.
  const enJeu = missions.filter(m => getMissionStatut(m, now) !== 'terminée')
  return !isPersonneEngagee(person.id, enJeu, dateDebut, dateFin, { excludeMissionId })
}

/** Le véhicule peut-il être affecté à une mission sur cette période ? */
export function vehiculeDisponible(vehicule, missions, dateDebut, dateFin, options = {}) {
  const { excludeMissionId = null, now = nowStr() } = options
  if (vehicule.statut === 'en prêt') return false
  if (!dateDebut || !dateFin) return true
  const enJeu = missions.filter(m => getMissionStatut(m, now) !== 'terminée')
  return !isVehiculeEngage(vehicule.id, enJeu, dateDebut, dateFin, { excludeMissionId })
}
