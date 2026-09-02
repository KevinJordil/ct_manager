<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClock } from '../../stores/clock.js'
import { addDays, mondayOf, parseLocal, toDateString } from '../../datetime.js'
import { localeTag } from '../../i18n/index.js'
import { weekdayNames, monthNames } from '../../i18n/formats.js'

const props = defineProps({
  rows: { type: Array, required: true },
  events: { type: Array, required: true },
  view: { type: String, required: true }, // 'day' | 'week'
  date: { type: String, required: true }, // YYYY-MM-DD
})

const EVENT_HEIGHT = 24
const EVENT_GAP = 2
const ROW_PADDING = 5

const { locale } = useI18n()
const { nowString, todayString } = useClock()

const tag = computed(() => localeTag(locale.value))
const shortWeekdays = computed(() => weekdayNames(tag.value, 'short'))
const longWeekdays = computed(() => weekdayNames(tag.value, 'long'))
const longMonths = computed(() => monthNames(tag.value, 'long'))
const shortMonths = computed(() => monthNames(tag.value, 'short'))

// ── Period ──

const periodStart = computed(() =>
  props.view === 'day' ? props.date + 'T00:00' : mondayOf(props.date) + 'T00:00'
)

const periodEnd = computed(() =>
  props.view === 'day'
    ? props.date + 'T23:59'
    : addDays(mondayOf(props.date), 6) + 'T23:59'
)

const totalMinutes = computed(() => props.view === 'day' ? 24 * 60 : 7 * 24 * 60)

function minutesFromStart(dt) {
  return (parseLocal(dt) - parseLocal(periodStart.value)) / 60000
}

function percent(dt) {
  return Math.max(0, Math.min(100, (minutesFromStart(dt) / totalMinutes.value) * 100))
}

// ── Header row 1: day segments ──

const daySegments = computed(() => {
  if (props.view === 'day') {
    const d = parseLocal(props.date)
    return [{
      dateStr: props.date,
      label: `${longWeekdays.value[d.getDay()]} ${d.getDate()} ${longMonths.value[d.getMonth()]} ${d.getFullYear()}`,
      percent: 0,
      width: 100,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: props.date === todayString.value,
    }]
  }
  const monday = mondayOf(props.date)
  return Array.from({ length: 7 }, (_, index) => {
    const d = parseLocal(monday)
    d.setDate(d.getDate() + index)
    const dateStr = toDateString(d)
    return {
      dateStr,
      label: `${shortWeekdays.value[d.getDay()]} ${d.getDate()}`,
      sublabel: shortMonths.value[d.getMonth()],
      percent: (index / 7) * 100,
      width: 100 / 7,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: dateStr === todayString.value,
    }
  })
})

// ── Header row 2: hour ticks ──

const hourTicks = computed(() => {
  const ticks = []
  if (props.view === 'day') {
    for (let hour = 0; hour < 24; hour++) {
      ticks.push({
        label: hour % 2 === 0 ? `${String(hour).padStart(2, '0')}h` : '',
        percent: (hour * 60 / totalMinutes.value) * 100,
        major: hour % 6 === 0,
        hasLabel: hour % 2 === 0,
      })
    }
  } else {
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour += 3) {
        ticks.push({
          label: hour % 6 === 0 ? `${String(hour).padStart(2, '0')}h` : '',
          percent: ((day * 24 + hour) * 60 / totalMinutes.value) * 100,
          major: hour % 6 === 0,
          isDayStart: hour === 0,
          hasLabel: hour % 6 === 0,
        })
      }
    }
  }
  return ticks
})

// ── Grid lines ──

const gridLines = computed(() => {
  const lines = []
  if (props.view === 'day') {
    for (let hour = 1; hour < 24; hour++) {
      lines.push({ percent: (hour * 60 / totalMinutes.value) * 100, major: hour % 6 === 0, dayBorder: false })
    }
  } else {
    for (let day = 1; day <= 7; day++) {
      lines.push({ percent: (day * 24 * 60 / totalMinutes.value) * 100, major: true, dayBorder: true })
    }
    for (let day = 0; day < 7; day++) {
      for (let hour = 1; hour < 24; hour++) {
        lines.push({
          percent: ((day * 24 + hour) * 60 / totalMinutes.value) * 100,
          major: hour % 6 === 0,
          dayBorder: false,
        })
      }
    }
  }
  return lines
})

// ── Current time marker ──

const nowPercent = computed(() => {
  if (nowString.value < periodStart.value || nowString.value > periodEnd.value) return null
  return percent(nowString.value)
})

// ── Lane packing ──

/** Stacks overlapping events on as many lanes as needed */
function packLanes(events) {
  const inPeriod = events.filter(e => e.start < periodEnd.value && e.end > periodStart.value)
  const sorted = [...inPeriod].sort((a, b) => a.start.localeCompare(b.start))
  const laneEnds = []
  return sorted.map(event => {
    let lane = laneEnds.findIndex(end => end <= event.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(event.end)
    } else {
      laneEnds[lane] = event.end
    }
    return { ...event, lane }
  })
}

const rowsData = computed(() =>
  props.rows.map(row => {
    const events = packLanes(props.events.filter(e => e.rowId === row.id))
    const lanes = events.length ? Math.max(...events.map(e => e.lane)) + 1 : 0
    const height = ROW_PADDING * 2 + Math.max(1, lanes) * (EVENT_HEIGHT + EVENT_GAP) - EVENT_GAP
    return { row, events, height }
  })
)

// ── Event rendering ──

function eventWidthPercent(event) {
  return Math.max(0.2, percent(event.end) - percent(event.start))
}

function eventStyle(event) {
  return {
    left: percent(event.start) + '%',
    width: eventWidthPercent(event) + '%',
    top: ROW_PADDING + event.lane * (EVENT_HEIGHT + EVENT_GAP) + 'px',
    height: EVENT_HEIGHT + 'px',
  }
}

function hourMinute(dt) {
  return dt ? dt.slice(11, 16) : ''
}

/**
 * How much text fits in the block, from its width as a share of the period.
 * Day view: 1% ≈ 14 min. Week view: 1% ≈ 100 min.
 */
function displayMode(event) {
  const width = eventWidthPercent(event)
  if (props.view === 'day') {
    if (width >= 7) return 'full'
    if (width >= 2) return 'times'
    if (width >= 0.8) return 'start'
    return 'none'
  }
  if (width >= 10) return 'full'
  if (width >= 4) return 'times'
  if (width >= 1.5) return 'start'
  return 'none'
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white w-full">
    <div style="min-width: 420px;">

      <!-- Sticky header, two rows -->
      <div class="sticky top-0 z-10 shadow-sm">

        <!-- Days -->
        <div class="flex bg-gray-50 border-b border-gray-200">
          <div class="shrink-0 sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-3 flex items-center"
            style="width: 160px; height: 34px;">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ $t('calendar.resource') }}</span>
          </div>
          <div class="flex-1 flex overflow-hidden">
            <div v-for="segment in daySegments" :key="segment.dateStr"
              :style="{ width: segment.width + '%' }"
              :class="['flex flex-col justify-center px-2 py-1 border-l overflow-hidden',
                segment.isToday ? 'bg-blue-50 border-blue-200'
                : segment.isWeekend ? 'bg-gray-100 border-gray-200'
                : 'bg-gray-50 border-gray-200']">
              <span :class="['text-xs font-semibold truncate leading-tight',
                segment.isToday ? 'text-blue-700' : 'text-gray-700']">
                {{ segment.label }}
              </span>
              <span v-if="segment.sublabel" class="text-[10px] text-gray-400 leading-none mt-0.5">
                {{ segment.sublabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- Hours -->
        <div class="flex bg-white border-b-2 border-gray-300">
          <div class="shrink-0 sticky left-0 z-20 bg-white border-r border-gray-200"
            style="width: 160px; height: 22px;" />
          <div class="flex-1 relative overflow-hidden" style="height: 22px;">
            <div v-for="tick in hourTicks" :key="tick.percent"
              :style="{ left: tick.percent + '%' }"
              :class="['absolute top-0 bottom-0 flex items-center',
                tick.isDayStart ? 'border-l-2 border-gray-400'
                : tick.major ? 'border-l border-gray-300'
                : 'border-l border-gray-100']">
              <span v-if="tick.hasLabel"
                class="text-[10px] font-semibold text-gray-500 pl-1 whitespace-nowrap leading-none">
                {{ tick.label }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Resource rows -->
      <div v-for="{ row, events, height } in rowsData" :key="row.id"
        :style="{ height: height + 'px' }"
        class="flex border-b border-gray-100 hover:bg-gray-50/30 transition-colors">

        <div class="shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 px-3 flex items-center"
          style="width: 160px;">
          <div class="min-w-0">
            <p class="font-medium text-gray-800 text-sm truncate leading-tight">{{ row.label }}</p>
            <p v-if="row.sublabel" class="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{{ row.sublabel }}</p>
          </div>
        </div>

        <div class="flex-1 relative overflow-hidden">

          <div v-for="segment in daySegments.filter(s => s.isWeekend)" :key="'weekend-' + segment.dateStr"
            :style="{ left: segment.percent + '%', width: segment.width + '%' }"
            class="absolute top-0 bottom-0 bg-gray-50/70 pointer-events-none" />

          <div v-for="segment in daySegments.filter(s => s.isToday)" :key="'today-' + segment.dateStr"
            :style="{ left: segment.percent + '%', width: segment.width + '%' }"
            class="absolute top-0 bottom-0 bg-blue-50/40 pointer-events-none" />

          <div v-for="line in gridLines" :key="line.percent + '-' + line.dayBorder"
            :style="{ left: line.percent + '%' }"
            :class="['absolute top-0 bottom-0 pointer-events-none',
              line.dayBorder ? 'border-l-2 border-gray-300'
              : line.major ? 'border-l border-gray-200'
              : 'border-l border-gray-100']" />

          <div v-if="nowPercent !== null"
            :style="{ left: nowPercent + '%' }"
            class="absolute top-0 bottom-0 border-l-2 border-red-500 z-20 pointer-events-none">
            <div class="absolute -top-0 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
          </div>

          <div v-for="event in events" :key="event.id"
            :style="eventStyle(event)"
            :class="['absolute rounded overflow-hidden cursor-default select-none flex items-center', event.colorClass]"
            :title="`${hourMinute(event.start)} – ${hourMinute(event.end)}  •  ${event.label}`">

            <template v-if="displayMode(event) === 'full'">
              <span class="px-1.5 truncate leading-none font-medium" style="font-size: 11px;">
                <span class="opacity-80 font-bold">{{ hourMinute(event.start) }}–{{ hourMinute(event.end) }}</span>
                &thinsp;{{ event.label }}
              </span>
            </template>

            <template v-else-if="displayMode(event) === 'times'">
              <span class="px-1.5 truncate leading-none font-bold" style="font-size: 11px;">
                {{ hourMinute(event.start) }}–{{ hourMinute(event.end) }}
              </span>
            </template>

            <template v-else-if="displayMode(event) === 'start'">
              <span class="px-1 leading-none font-bold whitespace-nowrap" style="font-size: 10px;">
                {{ hourMinute(event.start) }}
              </span>
            </template>
            <!-- 'none': a coloured block with no text -->
          </div>
        </div>
      </div>

      <div v-if="rows.length === 0" class="py-10 text-center text-sm text-gray-400 italic">
        {{ $t('calendar.noResource') }}
      </div>
    </div>
  </div>
</template>
