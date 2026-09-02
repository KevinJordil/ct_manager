import { describe, it, expect } from 'vitest'
import {
  getMissionStatut, missionsEnCours, missionEngagePersonne, missionEngageVehicule,
  isEnCongeA, isEnCongePendant, getPersonStatut, getPersonStatutAffiche,
  getVehiculeStatut, missionsChevauchant, isPersonneEngagee, isVehiculeEngage,
  personneDisponible, vehiculeDisponible,
} from '../availability.js'

const NOW = '2026-09-02T10:00'

const mission = (over = {}) => ({
  id: 'm1', titre: 'Transport', dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T17:00',
  vehicules: [], personnes: [], ...over,
})
const person = (over = {}) => ({ id: 'p1', nom: 'Müller', prenom: 'Andreas', permis: ['930'], conges: [], indisponible: false, ...over })
const vehicule = (over = {}) => ({ id: 'v1', nom: 'Duro', categorie: 'moyen', statut: 'libre', places: 8, ...over })

describe('getMissionStatut', () => {
  it('est « en cours » entre le début et la fin', () => {
    expect(getMissionStatut(mission(), NOW)).toBe('en cours')
  })

  it('est « planifiée » avant le début', () => {
    expect(getMissionStatut(mission({ dateDebut: '2026-09-03T08:00', dateFin: '2026-09-03T17:00' }), NOW)).toBe('planifiée')
  })

  it('est « terminée » après la fin', () => {
    expect(getMissionStatut(mission({ dateDebut: '2026-09-01T08:00', dateFin: '2026-09-01T17:00' }), NOW)).toBe('terminée')
  })

  it('bascule à l\'heure exacte du début, en heure locale', () => {
    const m = mission({ dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T17:00' })
    expect(getMissionStatut(m, '2026-09-02T07:59')).toBe('planifiée')
    expect(getMissionStatut(m, '2026-09-02T08:00')).toBe('en cours')
    expect(getMissionStatut(m, '2026-09-02T17:00')).toBe('en cours')
    expect(getMissionStatut(m, '2026-09-02T17:01')).toBe('terminée')
  })

  it('retombe sur « planifiée » sans dates', () => {
    expect(getMissionStatut({ id: 'x' }, NOW)).toBe('planifiée')
    expect(getMissionStatut(null, NOW)).toBe('planifiée')
  })
})

describe('missionEngagePersonne / missionEngageVehicule', () => {
  it('reconnaît un chauffeur', () => {
    expect(missionEngagePersonne(mission({ vehicules: [{ vehiculeId: 'v1', chauffeurId: 'p1' }] }), 'p1')).toBe(true)
  })

  it('reconnaît le personnel sans véhicule', () => {
    expect(missionEngagePersonne(mission({ personnes: ['p1'] }), 'p1')).toBe(true)
  })

  it('ignore une personne non affectée', () => {
    expect(missionEngagePersonne(mission(), 'p1')).toBe(false)
  })

  it('reconnaît un véhicule engagé', () => {
    expect(missionEngageVehicule(mission({ vehicules: [{ vehiculeId: 'v1', chauffeurId: null }] }), 'v1')).toBe(true)
    expect(missionEngageVehicule(mission(), 'v1')).toBe(false)
  })
})

describe('congés', () => {
  const p = person({ conges: [{ id: 'c1', dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }] })

  it('détecte un congé en cours', () => {
    expect(isEnCongeA(p, NOW)).toBe(true)
    expect(isEnCongeA(p, '2026-09-06T10:00')).toBe(false)
  })

  it('détecte un congé chevauchant une période', () => {
    expect(isEnCongePendant(p, '2026-09-04T08:00', '2026-09-08T17:00')).toBe(true)
    expect(isEnCongePendant(p, '2026-09-06T08:00', '2026-09-08T17:00')).toBe(false)
  })

  it('renvoie false sans période ou sans congé', () => {
    expect(isEnCongePendant(p, null, '2026-09-08T17:00')).toBe(false)
    expect(isEnCongePendant(person(), '2026-09-04T08:00', '2026-09-08T17:00')).toBe(false)
  })
})

describe('getPersonStatut', () => {
  it('donne « disponible » par défaut', () => {
    expect(getPersonStatut(person(), NOW)).toBe('disponible')
  })

  it('donne « en congé » pendant un congé', () => {
    expect(getPersonStatut(person({ conges: [{ dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }] }), NOW)).toBe('en congé')
  })

  it('donne « indisponible » en priorité sur le congé', () => {
    const p = person({ indisponible: true, conges: [{ dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }] })
    expect(getPersonStatut(p, NOW)).toBe('indisponible')
  })
})

describe('getPersonStatutAffiche', () => {
  it('signale « en mission » quand une mission en cours engage la personne', () => {
    const missions = [mission({ personnes: ['p1'] })]
    expect(getPersonStatutAffiche(person(), missions, NOW)).toBe('en mission')
  })

  it('ne masque pas un congé par une mission', () => {
    const missions = [mission({ personnes: ['p1'] })]
    const p = person({ conges: [{ dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }] })
    expect(getPersonStatutAffiche(p, missions, NOW)).toBe('en congé')
  })

  it('reste « disponible » si la mission n\'est pas en cours', () => {
    const missions = [mission({ dateDebut: '2026-09-10T08:00', dateFin: '2026-09-10T17:00', personnes: ['p1'] })]
    expect(getPersonStatutAffiche(person(), missions, NOW)).toBe('disponible')
  })
})

describe('getVehiculeStatut', () => {
  it('donne « libre » sans mission', () => {
    expect(getVehiculeStatut(vehicule(), [], NOW)).toBe('libre')
  })

  it('donne « en mission » pendant une mission en cours', () => {
    const missions = [mission({ vehicules: [{ vehiculeId: 'v1', chauffeurId: 'p1' }] })]
    expect(getVehiculeStatut(vehicule(), missions, NOW)).toBe('en mission')
  })

  it('donne « en prêt » en priorité', () => {
    const missions = [mission({ vehicules: [{ vehiculeId: 'v1', chauffeurId: 'p1' }] })]
    expect(getVehiculeStatut(vehicule({ statut: 'en prêt' }), missions, NOW)).toBe('en prêt')
  })
})

describe('missionsChevauchant', () => {
  const missions = [
    mission({ id: 'a', dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T12:00' }),
    mission({ id: 'b', dateDebut: '2026-09-03T08:00', dateFin: '2026-09-03T12:00' }),
  ]

  it('ne retient que celles qui chevauchent', () => {
    expect(missionsChevauchant(missions, '2026-09-02T10:00', '2026-09-02T18:00').map(m => m.id)).toEqual(['a'])
  })

  it('exclut la mission en cours d\'édition', () => {
    expect(missionsChevauchant(missions, '2026-09-02T10:00', '2026-09-02T18:00', { excludeMissionId: 'a' })).toEqual([])
  })
})

describe('isPersonneEngagee / isVehiculeEngage', () => {
  const missions = [mission({ id: 'a', vehicules: [{ vehiculeId: 'v1', chauffeurId: 'p1' }] })]

  it('détecte le conflit sur une période qui chevauche', () => {
    expect(isPersonneEngagee('p1', missions, '2026-09-02T10:00', '2026-09-02T18:00')).toBe(true)
    expect(isVehiculeEngage('v1', missions, '2026-09-02T10:00', '2026-09-02T18:00')).toBe(true)
  })

  it('ne voit pas de conflit hors période', () => {
    expect(isPersonneEngagee('p1', missions, '2026-09-05T08:00', '2026-09-05T18:00')).toBe(false)
  })
})

describe('personneDisponible', () => {
  const missions = [mission({ id: 'a', personnes: ['p1'] })]

  it('refuse une personne marquée indisponible', () => {
    expect(personneDisponible(person({ indisponible: true }), [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuse une personne en congé sur la période', () => {
    const p = person({ conges: [{ dateDebut: '2026-09-09T00:00', dateFin: '2026-09-11T23:59' }] })
    expect(personneDisponible(p, [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuse une personne déjà engagée sur la période', () => {
    expect(personneDisponible(person(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { now: NOW })).toBe(false)
  })

  it('accepte la personne quand on édite la mission qui l\'engage', () => {
    expect(personneDisponible(person(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { excludeMissionId: 'a', now: NOW })).toBe(true)
  })

  it('ignore les missions déjà terminées', () => {
    const passees = [mission({ id: 'z', dateDebut: '2026-08-01T08:00', dateFin: '2026-08-01T17:00', personnes: ['p1'] })]
    expect(personneDisponible(person(), passees, '2026-08-01T09:00', '2026-08-01T12:00', { now: NOW })).toBe(true)
  })

  it('sans période, ne regarde que le congé du moment', () => {
    const p = person({ conges: [{ dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }] })
    expect(personneDisponible(p, missions, '', '', { now: NOW })).toBe(false)
    expect(personneDisponible(person(), missions, '', '', { now: NOW })).toBe(true)
  })
})

describe('vehiculeDisponible', () => {
  const missions = [mission({ id: 'a', vehicules: [{ vehiculeId: 'v1', chauffeurId: null }] })]

  it('refuse un véhicule en prêt', () => {
    expect(vehiculeDisponible(vehicule({ statut: 'en prêt' }), [], '2026-09-10T08:00', '2026-09-10T17:00')).toBe(false)
  })

  it('refuse un véhicule déjà engagé sur la période', () => {
    expect(vehiculeDisponible(vehicule(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { now: NOW })).toBe(false)
  })

  it('accepte le véhicule quand on édite la mission qui l\'engage', () => {
    expect(vehiculeDisponible(vehicule(), missions, '2026-09-02T10:00', '2026-09-02T18:00', { excludeMissionId: 'a', now: NOW })).toBe(true)
  })

  it('accepte un véhicule libre sans période saisie', () => {
    expect(vehiculeDisponible(vehicule(), missions, '', '')).toBe(true)
  })
})

describe('missionsEnCours', () => {
  it('filtre sur le statut calculé', () => {
    const missions = [
      mission({ id: 'a' }),
      mission({ id: 'b', dateDebut: '2026-09-10T08:00', dateFin: '2026-09-10T17:00' }),
    ]
    expect(missionsEnCours(missions, NOW).map(m => m.id)).toEqual(['a'])
  })
})
