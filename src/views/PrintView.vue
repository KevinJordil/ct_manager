<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePersonsStore } from '../stores/persons.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { useClock } from '../stores/clock.js'
import { getMissionStatus } from '../availability.js'
import { byCheckUrgency, checkStatus, lastCheck } from '../checks.js'
import { formatDateTime, parseLocal, mondayOf, addDays, toDateString } from '../datetime.js'
import { localeTag } from '../i18n/index.js'
import { weekdayNames, monthNames } from '../i18n/formats.js'
import { personName } from '../labels.js'

/**
 * Printable documents.
 *
 * Rendered as plain flowing HTML rather than the on-screen components: a
 * pixel timeline or a card grid does not survive a sheet of A4. The browser's
 * own print dialog produces the PDF, which keeps the application free of a
 * rendering library.
 */
const route = useRoute()
const router = useRouter()
const { t, te, locale } = useI18n()

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const { nowString, todayString } = useClock()

const ready = ref(false)
const document_ = computed(() => route.query.doc ?? '')
const tag = computed(() => localeTag(locale.value))

onMounted(async () => {
  await Promise.all([personsStore.init(), vehiclesStore.init(), missionsStore.init()])
  ready.value = true
  await nextTick()
  // Left to the user: opening the dialog automatically would fire before the
  // fonts settle, and steals the page from anyone who only wanted to look.
})

function printNow() {
  window.print()
}

function goBack() {
  router.back()
}

// ── Mission order ──

const mission = computed(() =>
  missionsStore.missions.find(candidate => candidate.id === route.query.id) ?? null
)

function vehicleOf(entry) {
  return vehiclesStore.vehicles.find(vehicle => vehicle.id === entry.vehicleId)
}

function personOf(id) {
  return personsStore.persons.find(person => person.id === id)
}

const missionCrew = computed(() =>
  (mission.value?.vehicles ?? []).map(entry => ({
    ...entry,
    vehicle: vehicleOf(entry),
    driver: entry.driverId ? personOf(entry.driverId) : null,
  }))
)

const missionStaff = computed(() =>
  (mission.value?.staffIds ?? []).map(personOf).filter(Boolean)
)

// ── Mission list ──

const listedMissions = computed(() => {
  const status = route.query.status
  const all = [...missionsStore.missions].sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (!status || status === 'all') return all
  return all.filter(candidate => getMissionStatus(candidate, nowString.value) === status)
})

// ── Weekly checks ──

const checkRows = computed(() =>
  byCheckUrgency(vehiclesStore.vehicles, todayString.value).map(({ vehicle, days }) => ({
    vehicle,
    days,
    status: checkStatus(vehicle, todayString.value),
    last: lastCheck(vehicle),
  }))
)

// ── Calendar ──
// Printed as a table: one row per resource, one column per day. A pixel
// timeline is unreadable once it leaves the screen.

const calendarView = computed(() => route.query.view ?? 'week')
const calendarDate = computed(() => route.query.date ?? todayString.value)
const calendarTab = computed(() => route.query.tab ?? 'vehicles')

const calendarDays = computed(() => {
  const shortWeekdays = weekdayNames(tag.value, 'short')
  if (calendarView.value === 'day') {
    const date = calendarDate.value
    const parsed = parseLocal(date)
    return [{ date, label: `${shortWeekdays[parsed.getDay()]} ${parsed.getDate()}` }]
  }
  if (calendarView.value === 'week') {
    const monday = mondayOf(calendarDate.value)
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index)
      const parsed = parseLocal(date)
      return { date, label: `${shortWeekdays[parsed.getDay()]} ${parsed.getDate()}` }
    })
  }
  const parsed = parseLocal(calendarDate.value)
  const total = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate()
  return Array.from({ length: total }, (_, index) => {
    const date = toDateString(new Date(parsed.getFullYear(), parsed.getMonth(), index + 1))
    return { date, label: String(index + 1) }
  })
})

const calendarRows = computed(() => {
  const source = calendarTab.value === 'persons' ? personsStore.persons : vehiclesStore.vehicles
  return source.map(item => ({
    id: item.id,
    label: calendarTab.value === 'persons' ? personName(item) : item.name,
    sublabel: calendarTab.value === 'persons' ? (item.licenses ?? []).join(', ') : item.plate,
  }))
})

/** Missions covering a resource on a given day, as short labels. */
function cellLabel(rowId, date) {
  const involved = missionsStore.missions.filter(candidate => {
    const covers = candidate.startDate.slice(0, 10) <= date && candidate.endDate.slice(0, 10) >= date
    if (!covers) return false
    return calendarTab.value === 'persons'
      ? candidate.vehicles?.some(entry => entry.driverId === rowId) || candidate.staffIds?.includes(rowId)
      : candidate.vehicles?.some(entry => entry.vehicleId === rowId)
  })

  if (calendarTab.value === 'persons') {
    const person = personsStore.persons.find(candidate => candidate.id === rowId)
    const onLeave = person?.leaves?.some(leave =>
      leave.startDate.slice(0, 10) <= date && leave.endDate.slice(0, 10) >= date)
    if (onLeave) return [{ text: t('status.leave'), leave: true }]
  }
  return involved.map(candidate => ({ text: candidate.title, leave: false }))
}

const calendarTitle = computed(() => {
  const months = monthNames(tag.value, 'long')
  const parsed = parseLocal(calendarDate.value)
  if (calendarView.value === 'month') return `${months[parsed.getMonth()]} ${parsed.getFullYear()}`
  if (calendarView.value === 'day') return formatDateTime(calendarDate.value)
  const monday = mondayOf(calendarDate.value)
  return `${formatDateTime(monday)} – ${formatDateTime(addDays(monday, 6))}`
})

const documentTitle = computed(() => {
  const key = document_.value
  return te(`printing.documents.${key}`) ? t(`printing.documents.${key}`) : t('printing.unknownDocument')
})

</script>

<template>
  <div class="print-page">
    <!-- Toolbar, never printed -->
    <div class="no-print sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center gap-3">
      <button @click="goBack" class="btn-secondary">← {{ $t('printing.backToApp') }}</button>
      <button @click="printNow" class="btn-primary">{{ $t('printing.printNow') }}</button>
    </div>

    <div v-if="!ready" class="p-8 text-gray-400">{{ $t('common.loading') }}</div>

    <article v-else class="document">
      <header class="doc-header">
        <div>
          <p class="doc-app">{{ $t('printing.page') }}</p>
          <h1 class="doc-title">{{ documentTitle }}</h1>
        </div>
        <p class="doc-date">{{ $t('printing.generatedOn', { date: formatDateTime(nowString) }) }}</p>
      </header>

      <!-- ── Mission order ── -->
      <section v-if="document_ === 'mission' && mission">
        <h2 class="doc-subject">{{ mission.title }}</h2>
        <p v-if="mission.description" class="doc-description">{{ mission.description }}</p>

        <table class="facts">
          <tbody>
            <tr>
              <th>{{ $t('missions.start') }}</th>
              <td>{{ formatDateTime(mission.startDate) }}</td>
              <th>{{ $t('missions.end') }}</th>
              <td>{{ formatDateTime(mission.endDate) }}</td>
            </tr>
          </tbody>
        </table>

        <h3 v-if="missionCrew.length">{{ $t('printing.crew') }}</h3>
        <table v-if="missionCrew.length" class="doc-table">
          <thead>
            <tr>
              <th>{{ $t('vehicles.name') }}</th>
              <th>{{ $t('vehicles.plate') }}</th>
              <th>{{ $t('printing.driver') }}</th>
              <th>{{ $t('persons.phone') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in missionCrew" :key="entry.id">
              <td>
                {{ entry.vehicle?.name ?? '—' }}
                <span v-if="entry.withTrailer"> ({{ $t('missions.trailerBadge') }})</span>
              </td>
              <td>{{ entry.vehicle?.plate ?? '—' }}</td>
              <td>{{ entry.driver ? personName(entry.driver) : $t('missions.noDriver') }}</td>
              <td>{{ entry.driver?.phone || '—' }}</td>
            </tr>
          </tbody>
        </table>

        <h3 v-if="missionStaff.length">{{ $t('printing.staff') }}</h3>
        <table v-if="missionStaff.length" class="doc-table">
          <tbody>
            <tr v-for="person in missionStaff" :key="person.id">
              <td>{{ personName(person) }}</td>
              <td>{{ person.phone || '—' }}</td>
            </tr>
          </tbody>
        </table>

        <template v-if="mission.notes">
          <h3>{{ $t('missions.notes') }}</h3>
          <p class="doc-notes">{{ mission.notes }}</p>
        </template>
      </section>

      <!-- ── Mission list ── -->
      <section v-else-if="document_ === 'missions'">
        <table class="doc-table">
          <thead>
            <tr>
              <th>{{ $t('missions.missionTitle') }}</th>
              <th>{{ $t('missions.start') }}</th>
              <th>{{ $t('missions.end') }}</th>
              <th>{{ $t('printing.status') }}</th>
              <th>{{ $t('nav.vehicles') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in listedMissions" :key="item.id">
              <td>{{ item.title }}</td>
              <td>{{ formatDateTime(item.startDate) }}</td>
              <td>{{ formatDateTime(item.endDate) }}</td>
              <td>{{ $t(`status.${getMissionStatus(item, nowString)}`) }}</td>
              <td>{{ (item.vehicles ?? []).length }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="listedMissions.length === 0" class="doc-empty">{{ $t('printing.noData') }}</p>
      </section>

      <!-- ── Weekly checks ── -->
      <section v-else-if="document_ === 'checks'">
        <table class="doc-table">
          <thead>
            <tr>
              <th>{{ $t('vehicles.name') }}</th>
              <th>{{ $t('vehicles.plate') }}</th>
              <th>{{ $t('printing.lastCheck') }}</th>
              <th>{{ $t('printing.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in checkRows" :key="row.vehicle.id"
              :class="{ 'row-warn': row.status !== 'ok' }">
              <td>{{ row.vehicle.name }}</td>
              <td>{{ row.vehicle.plate }}</td>
              <td>{{ row.last ? formatDateTime(row.last.date) : '—' }}</td>
              <td>{{ $t(`checks.status.${row.status}`, { days: row.days }) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="checkRows.length === 0" class="doc-empty">{{ $t('printing.noData') }}</p>
      </section>

      <!-- ── Calendar ── -->
      <section v-else-if="document_ === 'calendar'">
        <h2 class="doc-subject">{{ calendarTitle }}</h2>
        <table class="doc-table calendar">
          <thead>
            <tr>
              <th class="resource">{{ $t('printing.resource') }}</th>
              <th v-for="day in calendarDays" :key="day.date">{{ day.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in calendarRows" :key="row.id">
              <td class="resource">
                {{ row.label }}
                <span v-if="row.sublabel" class="sub">{{ row.sublabel }}</span>
              </td>
              <td v-for="day in calendarDays" :key="day.date">
                <span v-for="(entry, index) in cellLabel(row.id, day.date)" :key="index"
                  :class="['cell-entry', { leave: entry.leave }]">{{ entry.text }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else>
        <p class="doc-empty">{{ $t('printing.unknownDocument') }}</p>
      </section>
    </article>
  </div>
</template>

<style scoped>
.print-page { background: #f3f4f6; min-height: 100vh; }
.document {
  background: white;
  max-width: 210mm;
  margin: 1.5rem auto;
  padding: 14mm;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  color: #111827;
  font-size: 11pt;
  line-height: 1.45;
}

.doc-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 16px;
}
.doc-app { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin: 0; }
.doc-title { font-size: 17pt; font-weight: 700; margin: 2px 0 0; }
.doc-date { font-size: 9pt; color: #6b7280; margin: 0; }

.doc-subject { font-size: 14pt; font-weight: 600; margin: 0 0 4px; }
.doc-description { color: #374151; margin: 0 0 12px; }
.doc-notes { white-space: pre-wrap; color: #374151; }
.doc-empty { color: #6b7280; font-style: italic; }

h3 { font-size: 11pt; font-weight: 600; margin: 16px 0 6px; }

.facts { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.facts th { text-align: left; font-weight: 600; padding: 3px 10px 3px 0; white-space: nowrap; }
.facts td { padding: 3px 20px 3px 0; }

.doc-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.doc-table th, .doc-table td {
  border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top;
}
.doc-table thead th { background: #f3f4f6; font-weight: 600; }
.row-warn td { background: #fef2f2; }

.calendar { font-size: 8pt; }
.calendar td, .calendar th { padding: 2px 3px; overflow: hidden; }
.calendar .resource { width: 22%; font-size: 9pt; }

.calendar .sub { display: block; color: #6b7280; font-size: 7pt; }
.cell-entry { display: block; background: #fed7aa; border-radius: 2px; padding: 0 2px; margin-bottom: 1px; }
.cell-entry.leave { background: #fecaca; }

@media print {
  .print-page { background: white; }
  .no-print { display: none !important; }
  .document { margin: 0; padding: 0; max-width: none; box-shadow: none; }
  .doc-table { page-break-inside: auto; }
  .doc-table tr { page-break-inside: avoid; page-break-after: auto; }
  .doc-table thead { display: table-header-group; }
  h3 { page-break-after: avoid; }
}
</style>
