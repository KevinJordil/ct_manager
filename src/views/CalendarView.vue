<script setup>
import { ref, computed, onMounted } from 'vue'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useMissionsStore } from '../stores/missions.js'
import { getMissionStatut } from '../utils.js'
import CalendarGrid from '../components/calendar/CalendarGrid.vue'
import CalendarTimeline from '../components/calendar/CalendarTimeline.vue'

const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const missionsStore = useMissionsStore()

onMounted(() => {
  vehiclesStore.init()
  personsStore.init()
  missionsStore.init()
})

// ── State ──

const now = new Date()
const currentDate = ref(now.toISOString().slice(0, 10))
const viewMode = ref('week')   // 'day' | 'week' | 'month'
const activeTab = ref('vehicles')

// ── Navigation ──

const DOW_FR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa']
const MONTH_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MONTH_FR_SHORT = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function getMondayStr(dateStr) {
  const d = new Date(dateStr + 'T00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function prevPeriod() {
  if (viewMode.value === 'day') currentDate.value = addDaysToDate(currentDate.value, -1)
  else if (viewMode.value === 'week') currentDate.value = addDaysToDate(currentDate.value, -7)
  else {
    const d = new Date(currentDate.value + 'T00:00')
    d.setMonth(d.getMonth() - 1)
    currentDate.value = d.toISOString().slice(0, 10)
  }
}

function nextPeriod() {
  if (viewMode.value === 'day') currentDate.value = addDaysToDate(currentDate.value, 1)
  else if (viewMode.value === 'week') currentDate.value = addDaysToDate(currentDate.value, 7)
  else {
    const d = new Date(currentDate.value + 'T00:00')
    d.setMonth(d.getMonth() + 1)
    currentDate.value = d.toISOString().slice(0, 10)
  }
}

function goToToday() {
  currentDate.value = new Date().toISOString().slice(0, 10)
}

const periodLabel = computed(() => {
  const d = new Date(currentDate.value + 'T00:00')
  if (viewMode.value === 'day') {
    return `${DOW_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`
  }
  if (viewMode.value === 'week') {
    const monday = new Date(getMondayStr(currentDate.value) + 'T00:00')
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const startLabel = `${monday.getDate()} ${MONTH_FR_SHORT[monday.getMonth()]}`
    const endLabel = monday.getMonth() === sunday.getMonth()
      ? sunday.getDate()
      : `${sunday.getDate()} ${MONTH_FR_SHORT[sunday.getMonth()]}`
    return `${startLabel} – ${endLabel} ${sunday.getFullYear()}`
  }
  return `${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`
})

// For month grid: extract year/month from currentDate
const gridYear = computed(() => parseInt(currentDate.value.slice(0, 4)))
const gridMonth = computed(() => parseInt(currentDate.value.slice(5, 7)))

const CATEGORIE_LABELS = {
  'léger-route': 'Léger (route)',
  'léger-tt': 'Léger (TT)',
  'moyen': 'Moyen ≤ 7.5t',
  'lourd': 'Lourd',
}

// ── Mission colors (computed statut) ──

const MISSION_COLOR = {
  planifiée: 'bg-blue-100 text-blue-800',
  'en cours': 'bg-orange-100 text-orange-800',
  terminée: 'bg-green-100 text-green-700',
}

function missionColor(m) {
  return MISSION_COLOR[getMissionStatut(m)] ?? 'bg-gray-100 text-gray-700'
}

// ── Vehicle rows & events ──

const vehicleRows = computed(() =>
  vehiclesStore.vehicles.map(v => ({
    id: v.id,
    label: v.nom,
    sublabel: `${v.immatriculation} · ${CATEGORIE_LABELS[v.categorie] ?? v.categorie}`,
  }))
)

const vehicleEvents = computed(() =>
  missionsStore.missions.flatMap(m =>
    (m.vehicules ?? [])
      .filter(v => v.vehiculeId)
      .map(v => ({
        id: `${m.id}-${v.vehiculeId}`,
        rowId: v.vehiculeId,
        label: m.titre,
        dateDebut: m.dateDebut,
        dateFin: m.dateFin,
        type: 'mission',
        colorClass: missionColor(m),
      }))
  )
)

// ── Person rows & events ──

const personRows = computed(() =>
  personsStore.persons.map(p => ({
    id: p.id,
    label: `${p.grade ? p.grade + ' ' : ''}${p.prenom} ${p.nom}`,
    sublabel: p.indisponible
      ? p.commentaireIndisponible || 'Indisponible'
      : (p.permis.join(', ') || '—'),
  }))
)

const personEvents = computed(() => {
  const events = []

  missionsStore.missions.forEach(m => {
    const colorClass = missionColor(m)
    ;(m.vehicules ?? []).forEach(v => {
      if (!v.chauffeurId) return
      events.push({
        id: `ch-${m.id}-${v.chauffeurId}`,
        rowId: v.chauffeurId,
        label: m.titre,
        dateDebut: m.dateDebut,
        dateFin: m.dateFin,
        type: 'mission',
        colorClass,
      })
    })
    ;(m.personnes ?? []).forEach(personId => {
      events.push({
        id: `pl-${m.id}-${personId}`,
        rowId: personId,
        label: m.titre,
        dateDebut: m.dateDebut,
        dateFin: m.dateFin,
        type: 'mission',
        colorClass,
      })
    })
  })

  personsStore.persons.forEach(p => {
    p.conges?.forEach(c => {
      events.push({
        id: `conge-${c.id}`,
        rowId: p.id,
        label: 'Congé',
        dateDebut: c.dateDebut,
        dateFin: c.dateFin,
        type: 'conge',
        colorClass: 'bg-red-100 text-red-700',
      })
    })
  })

  return events
})

const activeRows = computed(() => activeTab.value === 'vehicles' ? vehicleRows.value : personRows.value)
const activeEvents = computed(() => activeTab.value === 'vehicles' ? vehicleEvents.value : personEvents.value)
</script>

<template>
  <div class="flex flex-col h-full">
    <h1 class="page-title">Calendrier</h1>

    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <!-- View mode -->
      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button v-for="v in ['day', 'week', 'month']" :key="v"
          @click="viewMode = v"
          :class="['px-3 py-1.5 text-sm font-medium transition-colors border-r last:border-r-0 border-gray-200',
            viewMode === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50']">
          {{ v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois' }}
        </button>
      </div>

      <!-- Resource tab -->
      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button @click="activeTab = 'vehicles'"
          :class="['px-3 py-1.5 text-sm font-medium transition-colors border-r border-gray-200',
            activeTab === 'vehicles' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50']">
          Véhicules
        </button>
        <button @click="activeTab = 'persons'"
          :class="['px-3 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'persons' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50']">
          Personnes
        </button>
      </div>

      <!-- Navigation -->
      <button @click="prevPeriod" class="icon-btn" title="Précédent">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <button @click="nextPeriod" class="icon-btn" title="Suivant">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
      <span class="text-sm font-semibold text-gray-800 min-w-[160px]">{{ periodLabel }}</span>
      <button @click="goToToday"
        class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
        Aujourd'hui
      </button>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-4 mb-4 text-xs text-gray-600">
      <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Planifiée</div>
      <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-orange-100 border border-orange-300" /> En cours</div>
      <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-green-100 border border-green-300" /> Terminée</div>
      <div v-if="activeTab === 'persons'" class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded bg-red-100 border border-red-300" /> Congé
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
