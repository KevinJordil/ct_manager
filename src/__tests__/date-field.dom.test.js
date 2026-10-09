// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import DateField from '../components/common/DateField.vue'

function mountField(props = {}) {
  const i18n = createI18n({ legacy: false, locale: 'fr', messages: { fr } })
  return mount(DateField, { props: { id: 'd', ...props }, global: { plugins: [i18n] } })
}

describe('DateField', () => {
  it('shows the day as dd/mm/yyyy, whatever the browser', () => {
    const wrapper = mountField({ modelValue: '2026-10-09' })
    expect(wrapper.find('#d').element.value).toBe('09/10/2026')
    expect(wrapper.find('#d').attributes('type')).toBe('text')
  })

  it('hands over the day once it is complete', async () => {
    const wrapper = mountField()
    await wrapper.find('#d').setValue('09/10/202')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.find('#d').setValue('09/10/2026')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['2026-10-09'])
  })

  it('says what is wrong with a day that does not exist, once the field is left', async () => {
    const wrapper = mountField()
    await wrapper.find('#d').setValue('31/02/2026')
    await wrapper.find('#d').trigger('blur')
    expect(wrapper.text()).toContain(fr.dates.invalid)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps to its bounds', async () => {
    const wrapper = mountField({ max: '2026-10-09' })
    await wrapper.find('#d').setValue('10/10/2026')
    await wrapper.find('#d').trigger('blur')
    expect(wrapper.text()).toContain('09/10/2026')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
