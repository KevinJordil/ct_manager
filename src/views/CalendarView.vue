<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useMissionsStore } from '../stores/missions.js'
import { useClock } from '../stores/clock.js'
import { getMissionStatus } from '../availability.js'
import { MISSION_STATUS } from '../constants.js'
import { addDays, addMonths, mondayOf, parseLocal, todayString } from '../datetime.js'
import { localeTag } from '../i18n/index.js'
import { weekdayNames, monthNames } from '../i18n/formats.js'
import { personName } from '../labels.js'
import CalendarGrid from '../components/calendar/CalendarGrid.vue'
import CalendarTimeline from '../components/calendar/CalendarTimeline.vue'

const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const missionsStore = useMissionsStore()
const { nowString } = useClock()
const { t, locale } = useI18n()
const router = useRouter()

function printCalendar() {
  router.push({
    path: '/print',
    query: { doc: 'calendar', view: viewMode.value, date: currentDate.value, tab: activeTab.value },
  })
}

onMounted(() => {
  vehiclesStore.init()
  personsStore.init()
  missionsStore.init()
})

// ── State ──

const currentDate = ref(todayString())
const viewMode = ref('week') // 'day' | 'week' | 'month'
const activeTab = ref('vehicles')

const VIEW_MODES = ['day', 'week', 'month']
const TABS = ['vehicles', 'persons']

// ── Navigation ──

const STEP_IN_DAYS = { day: 1, week: 7 }

function move(direction) {
  const step = STEP_IN_DAYS[viewMode.value]
  currentDate.value = step
    ? addDays(currentDate.value, direction * step)
    : addMonths(currentDate.value, direction)
}

function previousPeriod() { move(-1) }
function nextPeriod() { move(1) }
function goToToday() { currentDate.value = todayString() }

// ── Labels ──

const tag = computed(() => localeTag(locale.value))
const shortWeekdays = computed(() => weekdayNames(tag.value, 'short'))
const longMonths = computed(() => monthNames(tag.value, 'long'))
const shortMonths = computed(() => monthNames(tag.value, 'short'))

const periodLabel = computed(() => {
  const date = parseLocal(currentDate.value)

  if (viewMode.value === 'day') {
    return `${shortWeekdays.value[date.getDay()]} ${date.getDate()} ${longMonths.value[date.getMonth()]} ${date.getFullYear()}`
  }

  if (viewMode.value === 'week') {
    const monday = parseLocal(mondayOf(currentDate.value))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    // Within one month the month is written once, at the end:
    // "7 – 13 sep 2026" rather than "7 sep – 13 2026".
    const sameMonth = monday.getMonth() === sunday.getMonth()
    const start = sameMonth
      ? `${monday.getDate()}`
      : `${monday.getDate()} ${shortMonths.value[monday.getMonth()]}`
    const end = `${sunday.getDate()} ${shortMonths.value[sunday.getMonth()]}`
    return `${start} – ${end} ${sunday.getFullYear()}`
  }

  return `${longMonths.value[date.getMonth()]} ${date.getFullYear()}`
})

const gridYear = computed(() => parseInt(currentDate.value.slice(0, 4)))
const gridMonth = computed(() => parseInt(currentDate.value.slice(5, 7)))

// ── Mission colours, from the computed status ──

const COLOR_BY_STATUS = {
  [MISSION_STATUS.PLANNED]: 'bg-blue-100 text-blue-800',
  [MISSION_STATUS.ONGOING]: 'bg-orange-100 text-orange-800',
  [MISSION_STATUS.COMPLETED]: 'bg-green-100 text-green-700',
}

function missionColor(mission) {
  return COLOR_BY_STATUS[getMissionStatus(mission, nowString.value)] ?? 'bg-gray-100 text-gray-700'
}

// ── Vehicle rows and events ──

const vehicleRows = computed(() =>
  vehiclesStore.vehicles.map(vehicle => ({
    id: vehicle.id,
    label: vehicle.name,
    sublabel: `${vehicle.plate} · ${t(`vehicles.categories.${vehicle.category}`)}`,
  }))
)

const vehicleEvents = computed(() =>
  missionsStore.missions.flatMap(mission =>
    (mission.vehicles ?? [])
      .filter(entry => entry.vehicleId)
      .map(entry => ({
        id: `${mission.id}-${entry.vehicleId}`,
        rowId: entry.vehicleId,
        label: mission.title,
        start: mission.startDate,
        end: mission.endDate,
        type: 'mission',
        colorClass: missionColor(mission),
      }))
  )
)

// ── Person rows and events ──

const personRows = computed(() =>
  personsStore.persons.map(person => ({
    id: person.id,
    label: personName(person),
    sublabel: person.unavailable
      ? person.unavailabilityNote || t('status.unavailable')
      : (person.licenses.join(', ') || t('common.empty')),
  }))
)

const personEvents = computed(() => {
  const events = []

  for (const mission of missionsStore.missions) {
    const colorClass = missionColor(mission)
    for (const entry of mission.vehicles ?? []) {
      if (!entry.driverId) continue
      events.push({
        id: `driver-${mission.id}-${entry.driverId}`,
        rowId: entry.driverId,
        label: mission.title,
        start: mission.startDate,
        end: mission.endDate,
        type: 'mission',
        colorClass,
      })
    }
    for (const personId of mission.staffIds ?? []) {
      events.push({
        id: `staff-${mission.id}-${personId}`,
        rowId: personId,
        label: mission.title,
        start: mission.startDate,
        end: mission.endDate,
        type: 'mission',
        colorClass,
      })
    }
  }

  for (const person of personsStore.persons) {
    for (const leave of person.leaves ?? []) {
      events.push({
        id: `leave-${leave.id}`,
        rowId: person.id,
        label: t('status.leave'),
        start: leave.startDate,
        end: leave.endDate,
        type: 'leave',
        colorClass: 'bg-red-100 text-red-700',
      })
    }
  }

  return events
})

const activeRows = computed(() => activeTab.value === 'vehicles' ? vehicleRows.value : personRows.value)
const activeEvents = computed(() => activeTab.value === 'vehicles' ? vehicleEvents.value : personEvents.value)
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h1 class="page-title mb-0">{{ $t('calendar.title') }}</h1>
      <button @click="printCalendar" class="btn-secondary">{{ $t('printing.printCalendar') }}</button>
    </div>

    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button v-for="mode in VIEW_MODES" :key="mode"
          @click="viewMode = mode"
          :aria-pressed="viewMode === mode"
          :class="['px-3 py-2 text-sm font-medium transition-colors border-r last:border-r-0 border-gray-200',
            viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50']">
          {{ $t(`calendar.views.${mode}`) }}
        </button>
      </div>

      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button v-for="tab in TABS" :key="tab"
          @click="activeTab = tab"
          :aria-pressed="activeTab === tab"
          :class="['px-3 py-2 text-sm font-medium transition-colors border-r last:border-r-0 border-gray-200',
            activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50']">
          {{ $t(`calendar.tabs.${tab}`) }}
        </button>
      </div>

      <button @click="previousPeriod" class="icon-btn" :aria-label="$t('calendar.previousPeriod')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <button @click="nextPeriod" class="icon-btn" :aria-label="$t('calendar.nextPeriod')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
      <span class="text-sm font-semibold text-gray-800 min-w-[160px]">{{ periodLabel }}</span>
      <button @click="goToToday"
        class="text-xs px-3 min-h-[36px] rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
        {{ $t('calendar.today') }}
      </button>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-4 mb-4 text-xs text-gray-600">
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> {{ $t('status.planned') }}
      </div>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded bg-orange-100 border border-orange-300" /> {{ $t('status.ongoing') }}
      </div>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded bg-green-100 border border-green-300" /> {{ $t('status.completed') }}
      </div>
      <div v-if="activeTab === 'persons'" class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded bg-red-100 border border-red-300" /> {{ $t('status.leave') }}
      </div>
    </div>

    <!-- Calendar -->
    <Transition name="fade" mode="out-in">
      <CalendarTimeline
        v-if="viewMode === 'day' || viewMode === 'week'"
        :key="viewMode + '-' + currentDate + '-' + activeTab"
        :rows="activeRows"
        :events="activeEvents"
        :view="viewMode"
        :date="currentDate"
      />
      <CalendarGrid
        v-else
        :key="'month-' + gridYear + '-' + gridMonth + '-' + activeTab"
        :rows="activeRows"
        :events="activeEvents"
        :year="gridYear"
        :month="gridMonth"
      />
    </Transition>
  </div>
</template>
