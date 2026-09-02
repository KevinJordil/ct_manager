// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import itMessages from '../locales/it.json'
import CalendarView from '../views/CalendarView.vue'
import StatusBadge from '../components/common/StatusBadge.vue'

// Views load their data on mount: neutralise the network.
vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {},
  setSessionToken: () => {},
  hasSessionToken: () => true,
  api: {
    load: async () => ({ data: [], version: 'v0' }),
    save: async () => ({ version: 'v1' }),
  },
}))

const stubs = { RouterLink: true, CalendarGrid: true, CalendarTimeline: true }

function i18nFor(locale) {
  return createI18n({ legacy: false, locale, fallbackLocale: 'fr', messages: { fr, de, it: itMessages } })
}

function mountCalendar(locale = 'fr') {
  return mount(CalendarView, { global: { plugins: [createPinia(), i18nFor(locale)], stubs } })
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find(button => button.text().trim() === text)
}

async function clickLabelled(wrapper, label) {
  await wrapper.find(`button[aria-label="${label}"]`).trigger('click')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 2, 10, 0)) // Wednesday 2 September 2026, 10:00
})

afterEach(() => vi.useRealTimers())

describe('CalendarView — navigation', () => {
  it('opens on the current week, Monday to Sunday', () => {
    expect(mountCalendar().text()).toContain('31 Août – 6 Sept 2026')
  })

  it('moves one week forward and back', async () => {
    const wrapper = mountCalendar()
    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).toContain('7 – 13 Sept 2026')
    await clickLabelled(wrapper, fr.calendar.previousPeriod)
    expect(wrapper.text()).toContain('31 Août – 6 Sept 2026')
  })

  it('really advances by one day in day view', async () => {
    const wrapper = mountCalendar()
    await buttonWithText(wrapper, fr.calendar.views.day).trigger('click')
    expect(wrapper.text()).toContain('Mer 2 Septembre 2026')

    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).toContain('Jeu 3 Septembre 2026')

    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).toContain('Ven 4 Septembre 2026')
  })

  it('moves back a single day in day view', async () => {
    const wrapper = mountCalendar()
    await buttonWithText(wrapper, fr.calendar.views.day).trigger('click')
    await clickLabelled(wrapper, fr.calendar.previousPeriod)
    expect(wrapper.text()).toContain('Mar 1 Septembre 2026')
  })

  it('changes month in month view', async () => {
    const wrapper = mountCalendar()
    await buttonWithText(wrapper, fr.calendar.views.month).trigger('click')
    expect(wrapper.text()).toContain('Septembre 2026')

    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).toContain('Octobre 2026')

    await clickLabelled(wrapper, fr.calendar.previousPeriod)
    expect(wrapper.text()).toContain('Septembre 2026')
  })

  it('returns to today', async () => {
    const wrapper = mountCalendar()
    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).not.toContain('31 Août – 6 Sept 2026')

    await buttonWithText(wrapper, fr.calendar.today).trigger('click')
    expect(wrapper.text()).toContain('31 Août – 6 Sept 2026')
  })

  it('crosses the end of the month without skipping a day', async () => {
    const wrapper = mountCalendar()
    await buttonWithText(wrapper, fr.calendar.views.day).trigger('click')
    for (let i = 0; i < 28; i++) await clickLabelled(wrapper, fr.calendar.nextPeriod)
    // 2 September plus 28 days is 30 September.
    expect(wrapper.text()).toContain('Mer 30 Septembre 2026')
    await clickLabelled(wrapper, fr.calendar.nextPeriod)
    expect(wrapper.text()).toContain('Jeu 1 Octobre 2026')
  })
})

describe('CalendarView — languages', () => {
  it('renders German month and weekday names', async () => {
    const wrapper = mountCalendar('de')
    expect(wrapper.text()).toContain(de.calendar.views.week)
    await buttonWithText(wrapper, de.calendar.views.day).trigger('click')
    expect(wrapper.text()).toContain('Mi 2 September 2026')
  })

  it('renders Italian month and weekday names', async () => {
    const wrapper = mountCalendar('it')
    expect(wrapper.text()).toContain(itMessages.calendar.views.week)
    await buttonWithText(wrapper, itMessages.calendar.views.day).trigger('click')
    expect(wrapper.text()).toContain('Mer 2 Settembre 2026')
  })

  it('navigates the same way in every language', async () => {
    for (const [locale, messages] of [['de', de], ['it', itMessages]]) {
      const wrapper = mountCalendar(locale)
      const before = wrapper.text()
      await clickLabelled(wrapper, messages.calendar.nextPeriod)
      expect(wrapper.text()).not.toBe(before)
      await clickLabelled(wrapper, messages.calendar.previousPeriod)
      expect(wrapper.text()).toBe(before)
    }
  })
})

describe('StatusBadge', () => {
  function mountBadge(status, locale = 'fr') {
    return mount(StatusBadge, { props: { status }, global: { plugins: [i18nFor(locale)] } })
  }

  it('changes colour when the status changes', async () => {
    const wrapper = mountBadge('planned')
    expect(wrapper.classes().join(' ')).toContain('bg-blue-100')

    await wrapper.setProps({ status: 'ongoing' })
    expect(wrapper.classes().join(' ')).toContain('bg-orange-100')

    await wrapper.setProps({ status: 'completed' })
    expect(wrapper.classes().join(' ')).toContain('bg-green-100')
  })

  it('falls back to a neutral colour for an unknown status', () => {
    expect(mountBadge('unknown').classes().join(' ')).toContain('bg-gray-100')
  })

  it('translates the label', () => {
    expect(mountBadge('ongoing', 'fr').text()).toBe(fr.status.ongoing)
    expect(mountBadge('ongoing', 'de').text()).toBe(de.status.ongoing)
    expect(mountBadge('ongoing', 'it').text()).toBe(itMessages.status.ongoing)
  })
})
