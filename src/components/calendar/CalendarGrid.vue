<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClock } from '../../stores/clock.js'
import { localeTag } from '../../i18n/index.js'
import { weekdayNames } from '../../i18n/formats.js'

const props = defineProps({
  rows: { type: Array, required: true },   // [{id, label, sublabel?}]
  events: { type: Array, required: true }, // [{id, rowId, label, start, end, type, colorClass}]
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1-12
})

const { locale } = useI18n()
const { todayString } = useClock()

const shortWeekdays = computed(() => weekdayNames(localeTag(locale.value), 'short'))

const daysInMonth = computed(() => new Date(props.year, props.month, 0).getDate())

function dateStringOf(day) {
  return `${props.year}-${String(props.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const days = computed(() =>
  Array.from({ length: daysInMonth.value }, (_, index) => {
    const day = index + 1
    const date = new Date(props.year, props.month - 1, day)
    return {
      day,
      weekday: shortWeekdays.value[date.getDay()],
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: dateStringOf(day) === todayString.value,
    }
  })
)

function datePart(dt) {
  return dt ? dt.split('T')[0] : ''
}

function primaryEventOn(rowId, day) {
  const dateStr = dateStringOf(day)
  const covering = props.events.filter(event =>
    event.rowId === rowId && datePart(event.start) <= dateStr && datePart(event.end) >= dateStr
  )
  // Leave takes precedence over missions.
  return covering.find(event => event.type === 'leave') ?? covering[0] ?? null
}

/** Merges consecutive days covered by the same event into one cell */
function rowSegmentsOf(rowId) {
  const total = daysInMonth.value
  const segments = []
  let day = 1
  while (day <= total) {
    const event = primaryEventOn(rowId, day)
    let span = 1
    if (!event) {
      while (day + span <= total && !primaryEventOn(rowId, day + span)) span++
      segments.push({ day, span, event: null })
    } else {
      while (day + span <= total) {
        const next = primaryEventOn(rowId, day + span)
        if (!next || next.id !== event.id) break
        span++
      }
      segments.push({ day, span, event })
    }
    day += span
  }
  return segments
}

const rowSegments = computed(() =>
  props.rows.map(row => ({ row, segments: rowSegmentsOf(row.id) }))
)
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white">
    <table class="border-collapse text-xs" style="min-width: max-content; table-layout: fixed;">
      <colgroup>
        <col style="width: 160px;" />
        <col v-for="day in days" :key="day.day" style="width: 34px;" />
      </colgroup>
      <thead>
        <tr class="bg-gray-50">
          <th class="sticky left-0 z-20 bg-gray-50 border-b-2 border-r border-gray-200 px-3 py-2 text-left font-semibold text-gray-600 text-xs">
            {{ $t('calendar.resource') }}
          </th>
          <th v-for="day in days" :key="day.day"
            :class="['border-b-2 border-r border-gray-200 py-1.5 px-0 text-center font-medium',
              day.isToday ? 'bg-blue-50 border-b-blue-400' : day.isWeekend ? 'bg-gray-100' : 'bg-gray-50']">
            <div :class="['text-[10px] leading-none', day.isToday ? 'text-blue-600' : day.isWeekend ? 'text-gray-400' : 'text-gray-500']">
              {{ day.weekday }}
            </div>
            <div :class="['text-xs font-bold leading-tight mt-0.5', day.isToday ? 'text-blue-700' : day.isWeekend ? 'text-gray-400' : 'text-gray-700']">
              {{ day.day }}
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="{ row, segments } in rowSegments" :key="row.id"
          class="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
          <td class="sticky left-0 z-10 bg-white border-r border-gray-200 px-3 py-2">
            <p class="font-medium text-gray-800 text-sm leading-tight truncate">{{ row.label }}</p>
            <p v-if="row.sublabel" class="text-[11px] text-gray-400 leading-tight mt-0.5">{{ row.sublabel }}</p>
          </td>
          <td v-for="segment in segments" :key="segment.day"
            :colspan="segment.span"
            :class="['p-0.5', !segment.event && days[segment.day - 1]?.isWeekend ? 'bg-gray-50' : '']">
            <div v-if="segment.event"
              :class="['h-7 rounded flex items-center px-2 overflow-hidden', segment.event.colorClass]"
              :title="segment.event.label">
              <span v-if="segment.span >= 2" class="truncate font-medium" style="font-size: 11px;">
                {{ segment.event.label }}
              </span>
            </div>
            <div v-else class="h-7" />
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="days.length + 1" class="py-8 text-center text-sm text-gray-400 italic">
            {{ $t('calendar.noResource') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
