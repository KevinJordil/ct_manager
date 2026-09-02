// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import itMessages from '../locales/it.json'

const data = vi.hoisted(() => ({ persons: [], vehicles: [], missions: [] }))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  setSessionToken: () => {},
  hasSessionToken: () => true,
  api: {
    load: async entity => ({ data: data[entity], version: 'v1' }),
    save: async () => ({ version: 'v2' }),
  },
}))

const DashboardView = (await import('../views/DashboardView.vue')).default
const PersonsView = (await import('../views/PersonsView.vue')).default
const VehiclesView = (await import('../views/VehiclesView.vue')).default
const MissionsView = (await import('../views/MissionsView.vue')).default

const stubs = { RouterLink: true, RouterView: true, CalendarGrid: true, CalendarTimeline: true }

function i18nFor(locale) {
  return createI18n({ legacy: false, locale, fallbackLocale: 'fr', messages: { fr, de, it: itMessages } })
}

function mountView(view, locale = 'fr') {
  return mount(view, { global: { plugins: [createPinia(), i18nFor(locale)], stubs } })
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const text = wrapper => wrapper.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 2, 10, 0))
  data.persons = [
    { id: 'p1', rank: 'Sgt', firstName: 'Andreas', lastName: 'Müller', licenses: ['930'], leaves: [], unavailable: false },
    { id: 'p2', rank: 'Sdt', firstName: 'Caroline', lastName: 'Favre', licenses: ['920'],
      leaves: [{ id: 'l1', startDate: '2026-09-01T00:00', endDate: '2026-09-05T23:59' }], unavailable: false },
  ]
  data.vehicles = [
    { id: 'v1', name: 'Duro', plate: 'M12345', category: 'medium', status: 'free', seats: 8 },
    { id: 'v2', name: 'Puch', plate: 'M54321', category: 'light-offroad', status: 'on-loan', loanNote: 'Cp EM' },
  ]
  data.missions = [
    { id: 'm1', title: 'Transport matériel', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
      vehicles: [{ id: 'x', vehicleId: 'v1', driverId: 'p1', withTrailer: false }], staffIds: [] },
    { id: 'm2', title: 'Reconnaissance', startDate: '2026-09-10T08:00', endDate: '2026-09-10T17:00',
      vehicles: [], staffIds: ['p2'] },
  ]
})

afterEach(() => vi.useRealTimers())

describe('Dashboard', () => {
  it('mounts and lists the ongoing missions', async () => {
    const wrapper = mountView(DashboardView)
    await settle()
    expect(text(wrapper)).toContain(fr.dashboard.title)
    expect(text(wrapper)).toContain('Transport matériel') // the only ongoing one
    expect(text(wrapper)).not.toContain('Reconnaissance')  // still planned
  })

  it('warns when a committed person is on leave', async () => {
    data.missions = [{
      id: 'm3', title: 'Convoi', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
      vehicles: [], staffIds: ['p2'],
    }]
    const wrapper = mountView(DashboardView)
    await settle()
    expect(text(wrapper)).toMatch(/Caroline Favre.*congé/)
  })

  it('translates the alert', async () => {
    data.missions = [{
      id: 'm3', title: 'Convoi', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
      vehicles: [], staffIds: ['p2'],
    }]
    const wrapper = mountView(DashboardView, 'de')
    await settle()
    expect(text(wrapper)).toMatch(/Caroline Favre.*Urlaub/)
  })
})

describe('List views', () => {
  it('show the persons', async () => {
    const wrapper = mountView(PersonsView)
    await settle()
    expect(text(wrapper)).toContain('Müller')
    expect(text(wrapper)).toContain(fr.status['on-leave'])
  })

  it('show the vehicles with their derived status', async () => {
    const wrapper = mountView(VehiclesView)
    await settle()
    const rendered = text(wrapper)
    expect(rendered).toContain('Duro')
    expect(rendered).toContain(fr.status['on-mission']) // committed to the ongoing mission
    expect(rendered).toContain(fr.status['on-loan'])
  })

  it('show the missions and their per-status counts', async () => {
    const wrapper = mountView(MissionsView)
    await settle()
    const rendered = text(wrapper)
    expect(rendered).toContain('Transport matériel')
    expect(rendered).toContain('Reconnaissance')
    expect(rendered).toContain(`${fr.missions.filters.all} (2)`)
    expect(rendered).toContain(`${fr.missions.filters.ongoing} (1)`)
    expect(rendered).toContain(`${fr.missions.filters.planned} (1)`)
  })

  it('filter the missions by status', async () => {
    const wrapper = mountView(MissionsView)
    await settle()
    const filter = wrapper.findAll('button').find(b => b.text().startsWith(fr.missions.filters.ongoing))
    await filter.trigger('click')
    expect(text(wrapper)).toContain('Transport matériel')
    expect(text(wrapper)).not.toContain('Reconnaissance')
  })
})

describe('Languages', () => {
  it('render the vehicle list in German', async () => {
    const wrapper = mountView(VehiclesView, 'de')
    await settle()
    const rendered = text(wrapper)
    expect(rendered).toContain(de.vehicles.title)
    expect(rendered).toContain(de.status['on-loan'])
    expect(rendered).toContain(de.vehicles.categories.medium)
  })

  it('render the mission list in Italian', async () => {
    const wrapper = mountView(MissionsView, 'it')
    await settle()
    const rendered = text(wrapper)
    expect(rendered).toContain(itMessages.missions.title)
    expect(rendered).toContain(itMessages.missions.filters.ongoing)
  })

  it('translate the person statuses in all three languages', async () => {
    for (const [locale, messages] of [['fr', fr], ['de', de], ['it', itMessages]]) {
      const wrapper = mountView(PersonsView, locale)
      await settle()
      expect(text(wrapper)).toContain(messages.status['on-leave'])
    }
  })
})

describe('Loading states', () => {
  it('show "loading" rather than "no mission"', () => {
    const wrapper = mountView(MissionsView) // not resolved yet
    expect(text(wrapper)).toContain(fr.common.loading)
    expect(text(wrapper)).not.toContain(fr.missions.empty)
  })

  it('show the empty state once loading is done', async () => {
    data.missions = []
    const wrapper = mountView(MissionsView)
    await settle()
    expect(text(wrapper)).toContain(fr.missions.empty)
  })
})
