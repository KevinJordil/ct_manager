// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import CalendarView from '../views/CalendarView.vue'
import StatusBadge from '../components/common/StatusBadge.vue'

// Les vues chargent leurs données au montage : on neutralise le réseau.
vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  definirCle: () => {},
  aUneCle: () => false,
  api: {
    load: async () => ({ data: [], version: 'v0' }),
    save: async () => ({ version: 'v1' }),
  },
}))

const stubs = { RouterLink: true, CalendarGrid: true, CalendarTimeline: true }

function monter() {
  return mount(CalendarView, { global: { plugins: [createPinia()], stubs } })
}

function boutonTexte(w, texte) {
  return w.findAll('button').find(b => b.text().trim() === texte)
}

async function cliquerLabel(w, label) {
  await w.find(`button[aria-label="${label}"]`).trigger('click')
}

async function passerEnVue(w, texte) {
  await boutonTexte(w, texte).trigger('click')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 2, 10, 0)) // mercredi 2 septembre 2026, 10 h
})

afterEach(() => vi.useRealTimers())

describe('CalendarView — navigation', () => {
  it('ouvre la semaine courante, du lundi au dimanche', () => {
    // Le mercredi 2 septembre 2026 appartient à la semaine du lundi 31 août.
    expect(monter().text()).toContain('31 aoû – 6 sep 2026')
  })

  it('avance puis recule d\'une semaine', async () => {
    const w = monter()
    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).toContain('7 – 13 sep 2026')
    await cliquerLabel(w, 'Période précédente')
    expect(w.text()).toContain('31 aoû – 6 sep 2026')
  })

  it('avance réellement d\'un jour en vue Jour', async () => {
    const w = monter()
    await passerEnVue(w, 'Jour')
    expect(w.text()).toContain('Me 2 Septembre 2026')

    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).toContain('Je 3 Septembre 2026')

    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).toContain('Ve 4 Septembre 2026')
  })

  it('recule d\'un seul jour en vue Jour', async () => {
    const w = monter()
    await passerEnVue(w, 'Jour')
    await cliquerLabel(w, 'Période précédente')
    expect(w.text()).toContain('Ma 1 Septembre 2026')
  })

  it('change de mois en vue Mois', async () => {
    const w = monter()
    await passerEnVue(w, 'Mois')
    expect(w.text()).toContain('Septembre 2026')

    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).toContain('Octobre 2026')

    await cliquerLabel(w, 'Période précédente')
    expect(w.text()).toContain('Septembre 2026')
  })

  it('revient sur aujourd\'hui', async () => {
    const w = monter()
    await cliquerLabel(w, 'Période suivante')
    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).not.toContain('31 aoû – 6 sep 2026')

    await boutonTexte(w, 'Aujourd\'hui').trigger('click')
    expect(w.text()).toContain('31 aoû – 6 sep 2026')
  })

  it('passe le cap du mois sans sauter de jour', async () => {
    const w = monter()
    await passerEnVue(w, 'Jour')
    for (let i = 0; i < 28; i++) await cliquerLabel(w, 'Période suivante')
    // 2 septembre + 28 jours = 30 septembre.
    expect(w.text()).toContain('Me 30 Septembre 2026')
    await cliquerLabel(w, 'Période suivante')
    expect(w.text()).toContain('Je 1 Octobre 2026')
  })
})

describe('StatusBadge', () => {
  it('change de couleur quand le statut change', async () => {
    const w = mount(StatusBadge, { props: { statut: 'planifiée' } })
    expect(w.classes().join(' ')).toContain('bg-blue-100')

    await w.setProps({ statut: 'en cours' })
    expect(w.classes().join(' ')).toContain('bg-orange-100')

    await w.setProps({ statut: 'terminée' })
    expect(w.classes().join(' ')).toContain('bg-green-100')
  })

  it('retombe sur une couleur neutre pour un statut inconnu', () => {
    const w = mount(StatusBadge, { props: { statut: 'inconnu' } })
    expect(w.classes().join(' ')).toContain('bg-gray-100')
  })
})
