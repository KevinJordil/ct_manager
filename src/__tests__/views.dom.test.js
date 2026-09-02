// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

const donnees = vi.hoisted(() => ({
  persons: [], vehicles: [], missions: [],
}))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  definirCle: () => {},
  aUneCle: () => false,
  api: {
    load: async entity => ({ data: donnees[entity], version: 'v1' }),
    save: async () => ({ version: 'v2' }),
  },
}))

const DashboardView = (await import('../views/DashboardView.vue')).default
const PersonsView = (await import('../views/PersonsView.vue')).default
const VehiclesView = (await import('../views/VehiclesView.vue')).default
const MissionsView = (await import('../views/MissionsView.vue')).default

const stubs = { RouterLink: true, RouterView: true, CalendarGrid: true, CalendarTimeline: true }

function monter(vue) {
  return mount(vue, { global: { plugins: [createPinia()], stubs } })
}

/** Texte rendu, espaces normalisés */
function texteDe(w) {
  return w.text().replace(/\s+/g, ' ')
}

const attendre = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 2, 10, 0))
  donnees.persons = [
    { id: 'p1', grade: 'Sgt', nom: 'Müller', prenom: 'Andreas', permis: ['930'], conges: [], indisponible: false },
    { id: 'p2', grade: 'Sdt', nom: 'Favre', prenom: 'Caroline', permis: ['920'],
      conges: [{ id: 'c1', dateDebut: '2026-09-01T00:00', dateFin: '2026-09-05T23:59' }], indisponible: false },
  ]
  donnees.vehicles = [
    { id: 'v1', nom: 'Duro', immatriculation: 'M12345', categorie: 'moyen', statut: 'libre', places: 8 },
    { id: 'v2', nom: 'Puch', immatriculation: 'M54321', categorie: 'léger-tt', statut: 'en prêt', commentairePret: 'Cp EM' },
  ]
  donnees.missions = [
    { id: 'm1', titre: 'Transport matériel', dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T17:00',
      vehicules: [{ id: 'x', vehiculeId: 'v1', chauffeurId: 'p1', avecRemorque: false }], personnes: [] },
    { id: 'm2', titre: 'Reconnaissance', dateDebut: '2026-09-10T08:00', dateFin: '2026-09-10T17:00',
      vehicules: [], personnes: ['p2'] },
  ]
})

afterEach(() => vi.useRealTimers())

describe('Tableau de bord', () => {
  it('se monte et compte les ressources', async () => {
    const w = monter(DashboardView)
    await attendre()
    const texte = w.text()
    expect(texte).toContain('Tableau de bord')
    expect(texte).toContain('Transport matériel')  // seule mission en cours
    expect(texte).not.toContain('Reconnaissance')  // encore planifiée
  })

  it('alerte quand une personne engagée est en congé', async () => {
    donnees.missions = [{
      id: 'm3', titre: 'Convoi', dateDebut: '2026-09-02T08:00', dateFin: '2026-09-02T17:00',
      vehicules: [], personnes: ['p2'],
    }]
    const w = monter(DashboardView)
    await attendre()
    expect(w.text()).toMatch(/Caroline Favre.*en congé/)
  })
})

describe('Vues de liste', () => {
  it('affichent les personnes', async () => {
    const w = monter(PersonsView)
    await attendre()
    expect(w.text()).toContain('Müller')
    expect(w.text()).toContain('en congé')
  })

  it('affichent les véhicules avec leur statut calculé', async () => {
    const w = monter(VehiclesView)
    await attendre()
    const texte = w.text()
    expect(texte).toContain('Duro')
    expect(texte).toContain('en mission') // engagé sur la mission en cours
    expect(texte).toContain('en prêt')
  })

  it('affichent les missions et leurs compteurs par statut', async () => {
    const w = monter(MissionsView)
    await attendre()
    const texte = texteDe(w)
    expect(texte).toContain('Transport matériel')
    expect(texte).toContain('Reconnaissance')
    expect(texte).toContain('Toutes (2)')
    expect(texte).toContain('En cours (1)')
    expect(texte).toContain('Planifiées (1)')
  })

  it('filtrent les missions par statut', async () => {
    const w = monter(MissionsView)
    await attendre()
    const filtre = w.findAll('button').find(b => b.text().startsWith('En cours'))
    await filtre.trigger('click')
    expect(w.text()).toContain('Transport matériel')
    expect(w.text()).not.toContain('Reconnaissance')
  })
})

describe('États de chargement', () => {
  it('affichent « Chargement… » plutôt que « Aucune mission »', () => {
    const w = monter(MissionsView) // pas encore résolu
    expect(w.text()).toContain('Chargement')
    expect(w.text()).not.toContain('Aucune mission')
  })

  it('affichent l\'état vide une fois le chargement terminé', async () => {
    donnees.missions = []
    const w = monter(MissionsView)
    await attendre()
    expect(w.text()).toContain('Aucune mission')
  })
})
