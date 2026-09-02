<script setup>
import { computed } from 'vue'
import { useClock } from '../../stores/clock.js'

const props = defineProps({
  rows: { type: Array, required: true },   // [{id, label, sublabel?}]
  events: { type: Array, required: true }, // [{id, rowId, label, dateDebut, dateFin, type, colorClass}]
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1-12
})

const DOW_FR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa']

const { todayStr } = useClock()

const daysInMonth = computed(() => new Date(props.year, props.month, 0).getDate())

const days = computed(() => {
  const result = []
  for (let d = 1; d <= daysInMonth.value; d++) {
    const date = new Date(props.year, props.month - 1, d)
    const dateStr = `${props.year}-${String(props.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    result.push({
      day: d,
      dow: DOW_FR[date.getDay()],
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: dateStr === todayStr.value,
    })
  }
  return result
})

function getDateStr(day) {
  return `${props.year}-${String(props.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function datePart(dt) {
  return dt ? dt.split('T')[0] : ''
}

function getPrimaryEvent(rowId, day) {
  const dateStr = getDateStr(day)
  const covering = props.events.filter(e =>
    e.rowId === rowId && datePart(e.dateDebut) <= dateStr && datePart(e.dateFin) >= dateStr
  )
  // Congé has priority over missions
  return covering.find(e => e.type === 'conge') ?? covering[0] ?? null
}

function computeRowSegments(rowId) {
  const n = daysInMonth.value
  const segments = []
  let d = 1
  while (d <= n) {
    const event = getPrimaryEvent(rowId, d)
    if (!event) {
      let span = 1
      while (d + span <= n && !getPrimaryEvent(rowId, d + span)) span++
      segments.push({ day: d, span, event: null, isWeekend: days.value[d - 1].isWeekend })
      d += span
    } else {
      let span = 1
      while (d + span <= n) {
        const next = getPrimaryEvent(rowId, d + span)
        if (!next || next.id !== event.id) break
        span++
      }
      segments.push({ day: d, span, event })
      d += span
    }
  }
  return segments
}

const rowSegments = computed(() =>
  props.rows.map(row => ({
    row,
    segments: computeRowSegments(row.id),
  }))
)
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white">
    <table class="border-collapse text-xs" style="min-width: max-content; table-layout: fixed;">
      <colgroup>
        <col style="width: 160px;" />
        <col v-for="d in days" :key="d.day" style="width: 34px;" />
      </colgroup>
      <thead>
        <tr class="bg-gray-50">
          <th class="sticky left-0 z-20 bg-gray-50 border-b-2 border-r border-gray-200 px-3 py-2 text-left font-semibold text-gray-600 text-xs">
            Ressource
          </th>
          <th v-for="d in days" :key="d.day"
            :class="['border-b-2 border-r border-gray-200 py-1.5 px-0 text-center font-medium',
              d.isToday ? 'bg-blue-50 border-b-blue-400' : d.isWeekend ? 'bg-gray-100' : 'bg-gray-50']">
            <div :class="['text-[10px] leading-none', d.isToday ? 'text-blue-600' : d.isWeekend ? 'text-gray-400' : 'text-gray-500']">
              {{ d.dow }}
            </div>
            <div :class="['text-xs font-bold leading-tight mt-0.5', d.isToday ? 'text-blue-700' : d.isWeekend ? 'text-gray-400' : 'text-gray-700']">
              {{ d.day }}
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
          <td v-for="seg in segments" :key="seg.day"
            :colspan="seg.span"
            :class="['p-0.5', !seg.event && days[seg.day - 1]?.isWeekend ? 'bg-gray-50' : '']">
            <div v-if="seg.event"
              :class="['h-7 rounded flex items-center px-2 overflow-hidden', seg.event.colorClass]"
              :title="seg.event.label">
              <span v-if="seg.span >= 2" class="truncate font-medium" style="font-size: 11px;">
                {{ seg.event.label }}
              </span>
            </div>
            <div v-else class="h-7" />
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="days.length + 1" class="py-8 text-center text-sm text-gray-400 italic">
            Aucune ressource à afficher
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
