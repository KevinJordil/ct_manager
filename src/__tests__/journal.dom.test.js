// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import itMessages from '../locales/it.json'
import { useAuthStore } from '../stores/auth.js'
import BattleLogView from '../views/BattleLogView.vue'
import VehiclesView from '../views/VehiclesView.vue'
import PersonsView from '../views/PersonsView.vue'
import MissionsView from '../views/MissionsView.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const mocks = vi.hoisted(() => ({ journal: vi.fn(), archiveJournal: vi.fn(), save: vi.fn(), updateItem: vi.fn(), push: vi.fn(), data: {} }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {}, setSessionToken: () => {}, hasSessionToken: () => true,
  api: { journal: mocks.journal, archiveJournal: mocks.archiveJournal,
    load: async entity => ({ data: structuredClone(mocks.data[entity] ?? []), version: 'v1' }),
    save: mocks.save, updateItem: mocks.updateItem, deleteItem: mocks.save, loadPersonAccounts: async () => [] },
}))
const entry = { id: 'take1', at: '2026-10-09T08:00', action: 'taken', name: 'Favre', vehiclePlate: 'M1', vehicleName: 'Duro', closedBy: 'return1' }
let wrappers = []
function mountView(view, locale = 'fr', admin = true) {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().user = { username: 'admin', role: admin ? 'admin' : 'user' }
  const wrapper = mount(view, { global: { plugins: [pinia, createI18n({ legacy: false, locale, fallbackLocale: 'fr', messages: { fr, de, it: itMessages } })], stubs: { Teleport: true, Transition: false, TransitionGroup: false, RouterLink: true } } })
  wrappers.push(wrapper)
  return wrapper
}
const button = (wrapper, label) => wrapper.findAll('button').find(b => b.text().trim() === label)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.journal.mockResolvedValue({ data: { entries: [entry], archives: [{ id: 'a1', name: 'Ancien cours', archivedAt: '2026-10-08T18:00', archivedBy: 'chef', entries: [{ ...entry, id: 'old', vehiclePlate: 'M99' }] }] }, version: 'j1' })
  mocks.save.mockResolvedValue({ version: 'v2' })
  mocks.updateItem.mockImplementation(async (_entity, _id, item) => ({ item, version: 'v2', previous: 'v1' }))
  mocks.archiveJournal.mockResolvedValue({ id: 'a2' })
  mocks.data = { persons: [{ id: 'p1', firstName: 'Jean', lastName: 'Favre', licenses: [], leaves: [] }], vehicles: [{ id: 'v1', name: 'Duro', plate: 'M1', category: 'medium', keyHolder: null }], missions: [] }
})
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers = [] })

describe('journal controls', () => {
  it('shows a saved archive independently of current vehicle records and prints its entire journal', async () => {
    const wrapper = mountView(BattleLogView)
    await flushPromises()
    await wrapper.find('select').setValue('a1')
    expect(wrapper.text()).toContain('M99')
    expect(wrapper.text()).toContain('chef')
    await button(wrapper, fr.printing.print).trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ path: '/print', query: { doc: 'journal', archive: 'a1' } })
    expect(button(wrapper, fr.log.archive)).toBeUndefined()
  })
  it('requires a name and opens an empty journal only after a successful archive', async () => {
    const wrapper = mountView(BattleLogView)
    await flushPromises()
    await button(wrapper, fr.log.archive).trigger('click')
    const form = wrapper.find('form')
    expect(form.find('button.btn-primary').attributes('disabled')).toBeDefined()
    await form.find('input').setValue('Cours octobre')
    mocks.journal.mockResolvedValue({ data: { entries: [], archives: [] }, version: 'j2' })
    await form.trigger('submit')
    await flushPromises()
    expect(mocks.archiveJournal).toHaveBeenCalledWith('Cours octobre', 'j1')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain(fr.log.empty)
  })
  it('keeps the form and current data if outstanding keys prevent archiving', async () => {
    const wrapper = mountView(BattleLogView)
    await flushPromises()
    await button(wrapper, fr.log.archive).trigger('click')
    await wrapper.find('form input').setValue('Cours')
    mocks.archiveJournal.mockRejectedValue({ code: 'journal.keysOut', params: {} })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain(fr.server.journal.keysOut)
    expect(wrapper.text()).toContain('M1')
  })
  it.each(['fr', 'de', 'it'])('keeps archiving restricted to administrators (%s)', async locale => {
    const wrapper = mountView(BattleLogView, locale, false)
    await flushPromises()
    expect(wrapper.find('.btn-primary').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('log.current')
    expect(wrapper.text()).not.toContain('log.exportCsv')
  })
})

describe('resource deletion', () => {
  it('disables vehicle deletion and names its active mission', async () => {
    mocks.data.missions = [{ id: 'm1', title: 'Transport', startDate: '2099-01-01T08:00', endDate: '2099-01-01T18:00', vehicles: [{ id: 'r1', vehicleId: 'v1' }], staffIds: [] }]
    const wrapper = mountView(VehiclesView)
    await flushPromises()
    await button(wrapper, fr.actions.delete).trigger('click')
    const modal = wrapper.findComponent(ConfirmModal)
    expect(modal.text()).toContain('Transport')
    expect(modal.find('button.btn-danger').attributes('disabled')).toBeDefined()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('requires returning or transferring a person’s key before deletion', async () => {
    mocks.data.vehicles[0].keyHolder = { personId: 'p1', name: 'Jean Favre', since: '2026-10-09T08:00' }
    const wrapper = mountView(PersonsView)
    await flushPromises()
    await button(wrapper, fr.actions.delete).trigger('click')
    const modal = wrapper.findComponent(ConfirmModal)
    expect(modal.text()).toContain('M1')
    expect(modal.find('button.btn-danger').attributes('disabled')).toBeDefined()
  })
  it('offers explicit cancellation for an empty mission and keeps its record', async () => {
    mocks.data.missions = [{ id: 'm1', title: 'Transport vide', startDate: '2099-01-01T08:00', endDate: '2099-01-01T18:00', vehicles: [], staffIds: [] }]
    const wrapper = mountView(MissionsView)
    await flushPromises()
    expect(wrapper.text()).toContain(fr.missions.emptyWarning)
    await button(wrapper, fr.missions.cancelMission).trigger('click')
    await wrapper.findComponent(ConfirmModal).find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(mocks.updateItem).toHaveBeenCalledWith('missions', 'm1', expect.objectContaining({ id: 'm1', cancelled: true }), expect.objectContaining({ id: 'm1' }))
    expect(wrapper.text()).toContain('Transport vide')
    expect(wrapper.text()).toContain(fr.status.cancelled)
  })
})
