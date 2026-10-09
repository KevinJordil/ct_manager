// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'

const server = vi.hoisted(() => ({
  data: {}, saves: [], refuse: null, statusCalls: [], passwordError: null,
}))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  setSessionToken: () => {},
  hasSessionToken: () => true,
  api: {
    load: async entity => ({ data: JSON.parse(JSON.stringify(server.data[entity] ?? [])), version: 'v1' }),
    // The server keeps each collection and applies one record at a time;
    // `saves` records the collection after each accepted write.
    createItem: async (entity, item) => write(entity, list => [...list, item], item),
    updateItem: async (entity, id, item) => write(entity, list => list.map(i => i.id === id ? item : i), item),
    deleteItem: async (entity, id) => write(entity, list => list.filter(i => i.id !== id), null),
    loadConfig: async () => ({}),
    loadRequests: async () => JSON.parse(JSON.stringify(server.data.requests ?? [])),
    setRequestStatus: async (id, status) => {
      server.statusCalls.push({ id, status })
      return { decidedBy: 'admin', decidedAt: '2026-09-02T10:00' }
    },
    loadPersonAccounts: async () => [],
    setPersonPassword: async () => {
      if (server.passwordError) throw Object.assign(new Error('taken'), { code: server.passwordError, params: {} })
      return {}
    },
  },
}))

function write(entity, change, item) {
  if (server.refuse === entity) throw Object.assign(new Error('refused'), { status: 403, code: 'permissions.denied' })
  server.data[entity] = change(server.data[entity] ?? [])
  server.saves.push({ entity, data: JSON.parse(JSON.stringify(server.data[entity])) })
  return { item, version: `v${server.saves.length + 1}`, previous: `v${server.saves.length}` }
}

const MissionsView = (await import('../views/MissionsView.vue')).default
const PersonsView = (await import('../views/PersonsView.vue')).default
const RequestsView = (await import('../views/RequestsView.vue')).default
const MissionForm = (await import('../components/missions/MissionForm.vue')).default
const PersonForm = (await import('../components/persons/PersonForm.vue')).default
const { useAuthStore } = await import('../stores/auth.js')

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function mountAsAdmin(view) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { id: 'u1', username: 'admin', role: 'admin', permissions: {} }
  const i18n = createI18n({ legacy: false, locale: 'fr', messages: { fr } })
  return mount(view, { global: { plugins: [pinia, i18n], stubs: { RouterLink: true, RouterView: true } } })
}

const newMission = {
  title: 'Transport', description: '', notes: '',
  startDate: '2026-09-20T08:00', endDate: '2026-09-20T17:00', vehicles: [], staffIds: [],
}

beforeEach(() => {
  server.data = {
    persons: [], vehicles: [], missions: [],
    requests: [{
      id: 'r1', status: 'pending', createdAt: '2026-09-01T09:00',
      contact: { firstName: 'Anne', lastName: 'Rey', company: 'EM', section: '', phone: '079' },
      startDate: '2026-09-20T08:00', endDate: '2026-09-20T17:00', meetingPoint: 'Caserne', comment: '',
      vehicles: [{ type: 'car', driverRequired: false }],
    }],
  }
  server.saves = []
  server.refuse = null
  server.statusCalls = []
  server.passwordError = null
})

describe('a refused save keeps the form and what was typed', () => {
  it('leaves the mission form open when the server refuses', async () => {
    server.refuse = 'missions'
    const wrapper = mountAsAdmin(MissionsView)
    await settle()
    await wrapper.find('button.btn-primary:not(.btn-secondary)').trigger('click')
    wrapper.findComponent(MissionForm).vm.$emit('save', newMission)
    await settle()
    expect(wrapper.findComponent(MissionForm).exists()).toBe(true)
  })

  it('closes it once the mission is stored', async () => {
    const wrapper = mountAsAdmin(MissionsView)
    await settle()
    await wrapper.find('button.btn-primary:not(.btn-secondary)').trigger('click')
    wrapper.findComponent(MissionForm).vm.$emit('save', newMission)
    await settle()
    expect(wrapper.findComponent(MissionForm).exists()).toBe(false)
    expect(server.saves.at(-1).data).toHaveLength(1)
  })

  it('creates one person, not two, when the password is refused then sent again', async () => {
    server.passwordError = 'users.usernameTaken'
    const wrapper = mountAsAdmin(PersonsView)
    await settle()
    await wrapper.find('button.btn-primary').trigger('click')
    const person = { rank: 'Sdt', firstName: 'Luca', lastName: 'Bernasconi', phone: '', licenses: [], notes: '' }
    wrapper.findComponent(PersonForm).vm.$emit('save', { person, password: 'x' })
    await settle()
    server.passwordError = null
    wrapper.findComponent(PersonForm).vm.$emit('save', { person, password: 'y' })
    await settle()
    expect(server.saves.filter(save => save.entity === 'persons').at(-1).data).toHaveLength(1)
  })
})

describe('approving a request', () => {
  async function approve() {
    const wrapper = mountAsAdmin(RequestsView)
    await settle()
    const button = wrapper.findAll('button').find(b => b.text() === fr.requests.approve)
    await button.trigger('click')
    wrapper.findComponent(MissionForm).vm.$emit('save', newMission)
    await settle()
    return wrapper
  }

  it('leaves the request pending when the mission is not stored', async () => {
    server.refuse = 'missions'
    const wrapper = await approve()
    expect(server.statusCalls).toEqual([])
    expect(wrapper.findComponent(MissionForm).exists()).toBe(true)
  })

  it('approves it once the mission is stored', async () => {
    await approve()
    expect(server.statusCalls).toEqual([{ id: 'r1', status: 'approved' }])
  })
})

describe('a deleted vehicle in a past mission', () => {
  it('is still shown by its plate', async () => {
    server.data.missions = [{
      id: 'm1', title: 'Ancienne', startDate: '2026-08-01T08:00', endDate: '2026-08-01T17:00',
      vehicles: [{ id: 'e', vehicleId: 'gone', driverId: 'left', withTrailer: false }], staffIds: [],
      retiredVehicles: { gone: { plate: 'M99999', name: 'Pinzgauer', category: 'light-offroad' } },
      retiredPersons: { left: { rank: 'Cpl', firstName: 'Marc', lastName: 'Ancien' } },
    }]
    const wrapper = mountAsAdmin(MissionsView)
    await settle()
    expect(wrapper.text()).toContain('M99999')
    expect(wrapper.text()).toContain('Ancien')
  })
})

describe('a cancelled mission', () => {
  it('can be reopened after a confirmation that names it', async () => {
    server.data.missions = [{ id: 'm1', title: 'Reprise', startDate: '2026-09-20T08:00', endDate: '2026-09-20T17:00',
      vehicles: [], staffIds: [], cancelled: true }]
    const wrapper = mountAsAdmin(MissionsView)
    await settle()
    await wrapper.findAll('button').find(b => b.text() === fr.missions.reopen).trigger('click')
    // The confirmation is teleported to <body>.
    expect(document.body.textContent).toContain('« Reprise »')
    const confirm = [...document.body.querySelectorAll('[role=dialog] button')]
      .find(button => button.textContent.trim() === fr.missions.reopen)
    confirm.click()
    await settle()
    expect(server.saves.at(-1).data[0].cancelled).toBe(false)
  })
})
