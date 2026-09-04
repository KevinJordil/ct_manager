// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'

const data = vi.hoisted(() => ({ persons: [], vehicles: [], missions: [] }))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  setSessionToken: () => {},
  hasSessionToken: () => true,
  api: {
    load: async entity => ({ data: data[entity], version: 'v1' }),
    save: async () => ({ version: 'v2' }),
    loadConfig: async () => ({}),
  },
}))

const MissionForm = (await import('../components/missions/MissionForm.vue')).default

function mountForm(mission) {
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  // BaseModal teleports to <body>; the stub renders it in place so the
  // wrapper can be queried.
  return mount(MissionForm, {
    props: { mission },
    global: { plugins: [createPinia(), i18n], stubs: { teleport: true } },
  })
}

const settle = async () => { await flushPromises(); await new Promise(r => setTimeout(r, 0)); await flushPromises() }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 2, 10, 0))
  data.persons = [
    { id: 'p1', rank: 'Sgt', firstName: 'Andreas', lastName: 'Müller', licenses: ['930'], leaves: [], unavailable: false },
    { id: 'p2', rank: 'Sdt', firstName: 'Caroline', lastName: 'Favre', licenses: ['930'], leaves: [], unavailable: false },
  ]
  data.vehicles = [
    { id: 'v1', name: 'Duro', plate: 'M1', category: 'medium', status: 'free', seats: 8, checks: [] },
  ]
  data.missions = [
    // The mission being edited.
    {
      id: 'm1', title: 'Édition', startDate: '2026-09-20T08:00', endDate: '2026-09-20T17:00',
      vehicles: [{ id: 'r1', vehicleId: 'v1', driverId: 'p1', withTrailer: false }],
      staffIds: ['p2'],
    },
    // Another mission that already books both people on a different week.
    {
      id: 'm2', title: 'Conflit', startDate: '2026-09-28T08:00', endDate: '2026-09-28T17:00',
      vehicles: [{ id: 'r2', vehicleId: 'v1', driverId: 'p1', withTrailer: false }],
      staffIds: ['p2'],
    },
  ]
})

afterEach(() => vi.useRealTimers())

/** The date and the hour are separate controls; the hour list is 24-hour. */
async function setWhen(wrapper, field, day, time) {
  await wrapper.find(`#mission-${field}`).setValue(day)
  await wrapper.find(`#mission-${field}-time`).setValue(time)
}

describe('MissionForm — assignments kept in step with the dates', () => {
  it('keeps the assignments while the dates do not conflict', async () => {
    const wrapper = mountForm(data.missions[0])
    await settle()
    expect(wrapper.vm.vehicleRows[0].driverId).toBe('p1')
    expect(wrapper.vm.staffRows).toHaveLength(1)
    expect(wrapper.text()).not.toContain('affectation')
  })

  it('drops the people who become unavailable when the dates move', async () => {
    const wrapper = mountForm(data.missions[0])
    await settle()

    // Move the mission onto the day the other one already books them. The
    // day and the hour are two controls now, the hour on a 24-hour list.
    await setWhen(wrapper, 'start', '2026-09-28', '08:00')
    await setWhen(wrapper, 'end', '2026-09-28', '17:00')
    await settle()

    expect(wrapper.vm.vehicleRows[0].driverId).toBeNull()
    expect(wrapper.vm.staffRows).toHaveLength(0)
  })

  it('says how many assignments it removed, rather than doing it silently', async () => {
    const wrapper = mountForm(data.missions[0])
    await settle()

    await setWhen(wrapper, 'start', '2026-09-28', '08:00')
    await setWhen(wrapper, 'end', '2026-09-28', '17:00')
    await settle()

    expect(wrapper.text()).toContain('2 affectations')
  })

  it('keeps the current driver selectable in their own dropdown', async () => {
    // The exemption that makes this work must not leak into the re-check.
    const wrapper = mountForm(data.missions[0])
    await settle()
    const driverOptions = wrapper.vm.availableDriversFor(wrapper.vm.vehicleRows[0])
    expect(driverOptions.map(person => person.id)).toContain('p1')
  })

  it('treats a prefilled mission without an id as a creation', async () => {
    const wrapper = mountForm({
      title: 'Depuis une demande', description: '', startDate: '2026-10-01T08:00',
      endDate: '2026-10-01T17:00', notes: '', vehicles: [], staffIds: [],
    })
    await settle()
    expect(wrapper.text()).toContain(fr.missions.new)
    expect(wrapper.text()).toContain(fr.actions.create)
  })
})
