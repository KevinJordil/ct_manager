import { describe, it, expect } from 'vitest'
import { valideCollection, ENTITES } from '../../validation.js'

const person = (over = {}) => ({ id: 'p1', nom: 'Müller', prenom: 'Andreas', permis: ['930'], conges: [], indisponible: false, ...over })
const vehicle = (over = {}) => ({ id: 'v1', nom: 'Duro', immatriculation: 'M+123', categorie: 'moyen', statut: 'libre', places: 8, ...over })
const mission = (over = {}) => ({ id: 'm1', titre: 'Transport', dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T17:00', vehicules: [], personnes: [], ...over })

describe('ENTITES', () => {
  it('couvre les trois collections', () => {
    expect(ENTITES).toEqual(['persons', 'vehicles', 'missions'])
  })
})

describe('valideCollection — cas valides', () => {
  it('accepte des collections vides', () => {
    for (const e of ENTITES) expect(valideCollection(e, [])).toBeNull()
  })

  it('accepte des données bien formées', () => {
    expect(valideCollection('persons', [person()])).toBeNull()
    expect(valideCollection('vehicles', [vehicle()])).toBeNull()
    expect(valideCollection('missions', [mission()])).toBeNull()
  })

  it('tolère les champs optionnels absents', () => {
    expect(valideCollection('persons', [{ id: 'p1', nom: 'X', prenom: 'Y' }])).toBeNull()
    expect(valideCollection('vehicles', [{ id: 'v1', nom: 'X' }])).toBeNull()
    expect(valideCollection('missions', [{ id: 'm1', titre: 'X' }])).toBeNull()
  })

  it('accepte une mission complète', () => {
    const m = mission({
      vehicules: [{ id: 'x', vehiculeId: 'v1', chauffeurId: 'p1', avecRemorque: true }],
      personnes: ['p2'],
    })
    expect(valideCollection('missions', [m])).toBeNull()
  })
})

describe('valideCollection — rejets', () => {
  it('refuse autre chose qu\'un tableau', () => {
    expect(valideCollection('persons', { id: 'p1' })).toMatch(/tableau/)
    expect(valideCollection('persons', null)).toMatch(/tableau/)
    expect(valideCollection('persons', 'oups')).toMatch(/tableau/)
  })

  it('refuse une collection inconnue', () => {
    expect(valideCollection('secrets', [])).toMatch(/inconnue/)
  })

  it('refuse des éléments qui ne sont pas des objets', () => {
    expect(valideCollection('persons', [1, 2, 3])).toMatch(/élément 0/)
    expect(valideCollection('persons', [null])).toMatch(/objet attendu/)
  })

  it('exige un identifiant', () => {
    expect(valideCollection('persons', [person({ id: undefined })])).toMatch(/"id"/)
    expect(valideCollection('persons', [person({ id: '' })])).toMatch(/"id"/)
  })

  it('refuse les identifiants en double', () => {
    expect(valideCollection('persons', [person(), person()])).toMatch(/double/)
  })

  it('refuse un champ texte du mauvais type', () => {
    expect(valideCollection('persons', [person({ nom: 42 })])).toMatch(/"nom"/)
    expect(valideCollection('missions', [mission({ titre: null })])).toMatch(/"titre"/)
  })

  it('refuse une catégorie ou un statut de véhicule inconnu', () => {
    expect(valideCollection('vehicles', [vehicle({ categorie: 'tank' })])).toMatch(/categorie/)
    expect(valideCollection('vehicles', [vehicle({ statut: 'en mission' })])).toMatch(/statut/)
  })

  it('refuse un nombre de places aberrant', () => {
    expect(valideCollection('vehicles', [vehicle({ places: -1 })])).toMatch(/places/)
    expect(valideCollection('vehicles', [vehicle({ places: 1.5 })])).toMatch(/places/)
  })

  it('refuse des dates mal formées', () => {
    expect(valideCollection('missions', [mission({ dateDebut: '02.09.2026' })])).toMatch(/dates/)
    expect(valideCollection('persons', [person({ conges: [{ id: 'c1', dateDebut: 'hier', dateFin: '2026-09-02' }] })]))
      .toMatch(/conges\[0\]/)
  })

  it('refuse des sous-objets de mission mal formés', () => {
    expect(valideCollection('missions', [mission({ vehicules: [{ id: 'x' }] })])).toMatch(/vehiculeId/)
    expect(valideCollection('missions', [mission({ personnes: [{ id: 'p1' }] })])).toMatch(/personnes/)
  })

  it('refuse une collection démesurée', () => {
    const trop = Array.from({ length: 5001 }, (_, i) => person({ id: `p${i}` }))
    expect(valideCollection('persons', trop)).toMatch(/trop d'éléments/)
  })
})
