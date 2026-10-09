<script setup>
import { computed } from 'vue'
import { formatLongDate } from '../../i18n/formats.js'
import { localeTag } from '../../i18n/index.js'
import { useI18n } from 'vue-i18n'
import { parseLocal } from '../../datetime.js'
import DateField from './DateField.vue'

/**
 * A date and a time, in one value of the form YYYY-MM-DDTHH:mm.
 *
 * The native datetime-local field is rendered in the *browser's* locale, not
 * the page's: an English browser shows "10/09/2026, 02:30 PM" whatever the
 * document says. The day is therefore typed as dd/mm/yyyy in a field of our
 * own (DateField, which still opens the browser's calendar), and the hour
 * comes from a list of our own, always on the 24-hour clock. The chosen day
 * is also spelt out underneath.
 */
const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  /** Lower bound, same shape as the value. */
  min: { type: String, default: '' },
  required: { type: Boolean, default: false },
  /** The hour a freshly picked day starts at. */
  defaultTime: { type: String, default: '08:00' },
  step: { type: Number, default: 15 },
})
const emit = defineEmits(['update:modelValue'])

const { locale, t } = useI18n()

const date = computed(() => (props.modelValue || '').slice(0, 10))
const time = computed(() => (props.modelValue || '').slice(11, 16))

const minDate = computed(() => (props.min || '').slice(0, 10))

/** Every quarter of an hour, plus whatever odd value is already stored. */
const times = computed(() => {
  const list = []
  for (let minutes = 0; minutes < 24 * 60; minutes += props.step) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    list.push(`${hh}:${mm}`)
  }
  if (time.value && !list.includes(time.value)) list.push(time.value)
  return list.sort()
})

/** The day, written out: no reader has to guess the field's order. */
const spelled = computed(() => {
  if (!date.value) return ''
  return formatLongDate(parseLocal(date.value), localeTag(locale.value))
})

/** The chosen time would fall before the lower bound on that day. */
const beforeMin = computed(() =>
  Boolean(props.min && props.modelValue && props.modelValue < props.min)
)

function onDate(day) {
  if (!day) return emit('update:modelValue', '')
  emit('update:modelValue', `${day}T${time.value || props.defaultTime}`)
}

function onTime(event) {
  const chosen = event.target.value
  // Picking an hour before a day is meaningless, so the day comes first.
  if (!date.value) return
  emit('update:modelValue', `${date.value}T${chosen}`)
}
</script>

<template>
  <div>
    <!-- The hour goes under the day when the column is too narrow for both. -->
    <div class="flex flex-wrap gap-2">
      <DateField :id="id" :model-value="date" :min="minDate" :required="required"
        @update:model-value="onDate" />
      <select :id="`${id}-time`" class="input w-24 shrink-0"
        :value="time" :disabled="!date" :required="required"
        :aria-label="t('common.time')" @change="onTime">
        <option value="" disabled>{{ t('common.time') }}</option>
        <option v-for="option in times" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>
    <p v-if="spelled" :class="['mt-1 text-xs', beforeMin ? 'text-red-600' : 'text-stone-500']">
      {{ spelled }}<span v-if="time"> · {{ time }}</span>
    </p>
  </div>
</template>
