<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate, parseSwissDate } from '../../datetime.js'

/**
 * A day, typed and shown as dd/mm/yyyy whatever the browser's language.
 *
 * The native date field is rendered in the browser's locale: an English
 * browser shows 10/09/2026 for the ninth of October, and nothing in the page
 * can change that. The day is therefore typed in a text field of our own —
 * 09/10/2026, 09.10.2026 or 09102026 all read the same — while a button still
 * opens the browser's calendar, which is worth far too much on a phone to
 * give up. The value stays YYYY-MM-DD, like every date of the application.
 */
const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  required: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const text = ref('')
const picker = ref(null)
const touched = ref(false)

watch(() => props.modelValue, value => {
  // Leave alone what is being typed when it already means this day.
  if (parseSwissDate(text.value) !== value) text.value = value ? formatDate(value) : ''
}, { immediate: true })

/** Why the typed text is not a usable day, or '' when it is. */
const problem = computed(() => {
  const typed = text.value.trim()
  if (!typed) return ''
  const day = parseSwissDate(typed)
  if (!day) return t('dates.invalid')
  if (props.min && day < props.min) return t('dates.tooEarly', { date: formatDate(props.min) })
  if (props.max && day > props.max) return t('dates.tooLate', { date: formatDate(props.max) })
  return ''
})

function onInput(event) {
  text.value = event.target.value
  const typed = text.value.trim()
  if (!typed) return emit('update:modelValue', '')
  const day = parseSwissDate(typed)
  // Only a whole, real and allowed day reaches the model; anything else waits.
  if (day && !problem.value) emit('update:modelValue', day)
}

function onBlur() {
  touched.value = true
  const day = parseSwissDate(text.value)
  if (day && !problem.value) text.value = formatDate(day)
}

function openPicker() {
  const input = picker.value
  if (!input) return
  try { input.showPicker() } catch { input.focus(); input.click() }
}

function onPicked(event) {
  if (!event.target.value) return
  text.value = formatDate(event.target.value)
  touched.value = true
  emit('update:modelValue', event.target.value)
}
</script>

<template>
  <div class="relative flex-1 min-w-[9.5rem]">
    <div class="flex">
      <input :id="id" type="text" inputmode="numeric" autocomplete="off" maxlength="10"
        :value="text" :required="required" :placeholder="t('dates.placeholder')"
        :aria-invalid="Boolean(touched && problem)" :aria-describedby="touched && problem ? `${id}-problem` : undefined"
        :class="['input rounded-r-none min-w-0 tabular-nums', touched && problem ? 'border-red-500' : '']"
        @input="onInput" @blur="onBlur" />
      <button type="button" @click="openPicker" :aria-label="t('dates.openCalendar')" :title="t('dates.openCalendar')"
        class="shrink-0 inline-flex items-center justify-center min-w-[40px] border border-l-0 border-stone-300 rounded-r-md bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </button>
    </div>
    <!-- The browser's own calendar, opened by the button; never shown as a field. -->
    <input ref="picker" type="date" tabindex="-1" aria-hidden="true"
      class="absolute bottom-0 right-0 w-px h-px opacity-0 pointer-events-none"
      :value="modelValue" :min="min || undefined" :max="max || undefined" @change="onPicked" />
    <p v-if="touched && problem" :id="`${id}-problem`" role="alert" class="mt-1 text-xs text-red-600">{{ problem }}</p>
  </div>
</template>
