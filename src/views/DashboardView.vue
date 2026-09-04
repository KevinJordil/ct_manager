<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePersonsStore } from '../stores/persons.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { useRequestsStore } from '../stores/requests.js'
import { useClock } from '../stores/clock.js'
import { formatDateTime } from '../datetime.js'
import {
  getPersonStatus, getVehicleStatus, isOnLeaveDuring,
  missionInvolvesPerson, ongoingMissions,
} from '../availability.js'
import { MISSION_STATUS, PERSON_STATUS, VEHICLE_STATUS, REQUEST_STATUS } from '../constants.js'
import { needsCheck } from '../checks.js'
import { personName, vehiclePlate, vehicleModel } from '../labels.js'
import { holderName, vehiclesWithKeyIn, vehiclesWithKeyOut } from '../keys.js'
import StatusBadge from '../components/common/StatusBadge.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const requestsStore = useRequestsStore()
const { nowString, todayString } = useClock()
const { t } = useI18n()

onMounted(() => {
  personsStore.init()
  vehiclesStore.init()
  missionsStore.init()
  requestsStore.init()
})

/**
 * The three things that actually call for a decision. The dashboard is the
 * landing page, so they belong here rather than buried in their own pages.
 */
const attention = computed(() => [
  {
    key: 'pendingRequests',
    to: '/requests',
    count: requestsStore.requests.filter(request => request.status === REQUEST_STATUS.PENDING).length,
    frame: 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400',
    value: 'text-amber-700',
  },
  {
    key: 'overdueChecks',
    to: '/checks',
    count: vehiclesStore.vehicles.filter(vehicle => needsCheck(vehicle, todayString.value)).length,
    frame: 'bg-red-50 border-red-200 text-red-800 hover:border-red-400',
    value: 'text-red-700',
  },
  {
    key: 'overdueLoans',
    to: '/vehicles',
    count: vehiclesStore.vehicles.filter(vehicle =>
      vehicle.status === VEHICLE_STATUS.ON_LOAN &&
      vehicle.loanUntil &&
      vehicle.loanUntil < todayString.value).length,
    frame: 'bg-orange-50 border-orange-200 text-orange-800 hover:border-orange-400',
    value: 'text-orange-700',
  },
].filter(item => item.count > 0))

const ongoing = computed(() => ongoingMissions(missionsStore.missions, nowString.value))

/** Counts items by status in a single pass */
function countByStatus(items, statusOf) {
  return items.reduce((totals, item) => {
    const status = statusOf(item)
    totals[status] = (totals[status] ?? 0) + 1
    return totals
  }, {})
}

const stats = computed(() => {
  const now = nowString.value

  const byVehicle = countByStatus(vehiclesStore.vehicles, vehicle =>
    getVehicleStatus(vehicle, missionsStore.missions, now)
  )

  const byPerson = countByStatus(personsStore.persons, person => {
    const base = getPersonStatus(person, now)
    if (base !== PERSON_STATUS.AVAILABLE) return PERSON_STATUS.UNAVAILABLE
    return ongoing.value.some(m => missionInvolvesPerson(m, person.id))
      ? PERSON_STATUS.ON_MISSION
      : PERSON_STATUS.AVAILABLE
  })

  return {
    personsAvailable: byPerson[PERSON_STATUS.AVAILABLE] ?? 0,
    personsOnMission: byPerson[PERSON_STATUS.ON_MISSION] ?? 0,
    personsUnavailable: byPerson[PERSON_STATUS.UNAVAILABLE] ?? 0,
    vehiclesFree: byVehicle[VEHICLE_STATUS.FREE] ?? 0,
    vehiclesOnMission: byVehicle[VEHICLE_STATUS.ON_MISSION] ?? 0,
    vehiclesOnLoan: byVehicle[VEHICLE_STATUS.ON_LOAN] ?? 0,
  }
})

/**
 * Where the keys are. This is the question asked at the counter — "can I take
 * that vehicle?" — so it answers from the keys alone, not from the planning.
 */
const keysOut = computed(() =>
  vehiclesWithKeyOut(vehiclesStore.vehicles).map(vehicle => ({
    id: vehicle.id,
    plate: vehiclePlate(vehicle),
    model: vehicleModel(vehicle),
    holder: holderName(vehicle.keyHolder, personsStore.persons),
    since: vehicle.keyHolder.since,
  }))
)

const keysIn = computed(() => vehiclesWithKeyIn(vehiclesStore.vehicles))

const ongoingDetails = computed(() =>
  ongoing.value.map(mission => ({
    ...mission,
    assignedVehicles: (mission.vehicles ?? []).map(entry => ({
      ...entry,
      vehicle: vehiclesStore.vehicles.find(v => v.id === entry.vehicleId),
      driver: entry.driverId ? personsStore.persons.find(p => p.id === entry.driverId) : null,
    })),
    unmountedStaff: (mission.staffIds ?? [])
      .map(id => personsStore.persons.find(p => p.id === id))
      .filter(Boolean),
  }))
)

/** Inconsistencies worth flagging on an ongoing mission */
const alerts = computed(() => {
  const list = []
  for (const mission of ongoing.value) {
    for (const entry of mission.vehicles ?? []) {
      const driver = entry.driverId
        ? personsStore.persons.find(p => p.id === entry.driverId)
        : null
      if (driver && isOnLeaveDuring(driver, mission.startDate, mission.endDate)) {
        list.push(t('dashboard.alerts.driverOnLeave', {
          mission: mission.title, person: personName(driver),
        }))
      }
      const vehicle = vehiclesStore.vehicles.find(v => v.id === entry.vehicleId)
      if (vehicle?.status === VEHICLE_STATUS.ON_LOAN) {
        list.push(t('dashboard.alerts.vehicleOnLoan', {
          mission: mission.title, vehicle: vehiclePlate(vehicle),
        }))
      }
    }
    for (const personId of mission.staffIds ?? []) {
      const person = personsStore.persons.find(p => p.id === personId)
      if (person && isOnLeaveDuring(person, mission.startDate, mission.endDate)) {
        list.push(t('dashboard.alerts.staffOnLeave', {
          mission: mission.title, person: personName(person),
        }))
      }
    }
  }
  return list
})
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('dashboard.title') }}</h1>

    <!-- What needs a decision, before anything else -->
    <section v-if="attention.length" class="mb-6">
      <h2 class="section-title">{{ $t('dashboard.attention') }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <RouterLink v-for="item in attention" :key="item.key" :to="item.to"
          :class="['rounded-xl border p-4 flex items-center gap-3 transition-colors', item.frame]">
          <span :class="['text-3xl font-bold', item.value]">{{ item.count }}</span>
          <span class="text-sm font-medium">
            {{ $t('dashboard.' + item.key, item.count, { count: item.count }) }}
          </span>
        </RouterLink>
      </div>
    </section>

    <div v-if="alerts.length" class="mb-6 space-y-2">
      <div v-for="alert in alerts" :key="alert" role="alert"
        class="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        {{ alert }}
      </div>
    </div>

    <section class="mb-8">
      <h2 class="section-title">{{ $t('nav.persons') }}</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="stat-card stat-green">
          <p class="stat-value">{{ stats.personsAvailable }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.available') }}</p>
        </div>
        <div class="stat-card stat-orange">
          <p class="stat-value">{{ stats.personsOnMission }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.onMission') }}</p>
        </div>
        <div class="stat-card stat-red">
          <p class="stat-value">{{ stats.personsUnavailable }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.unavailable') }}</p>
        </div>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="section-title">{{ $t('nav.vehicles') }}</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="stat-card stat-green">
          <p class="stat-value">{{ stats.vehiclesFree }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.free') }}</p>
        </div>
        <div class="stat-card stat-orange">
          <p class="stat-value">{{ stats.vehiclesOnMission }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.onMission') }}</p>
        </div>
        <div class="stat-card stat-red">
          <p class="stat-value">{{ stats.vehiclesOnLoan }}</p>
          <p class="stat-label">{{ $t('dashboard.stats.onLoan') }}</p>
        </div>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="section-title">{{ $t('keys.dashboardTitle') }}</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="card">
          <p class="flex items-center gap-2 font-semibold text-stone-900">
            <span class="w-2.5 h-2.5 rounded-full bg-green-500" />
            {{ $t('keys.availableCount', keysIn.length, { count: keysIn.length }) }}
          </p>
          <div v-if="keysIn.length" class="mt-3 flex flex-wrap gap-1.5">
            <RouterLink v-for="vehicle in keysIn" :key="vehicle.id" to="/vehicles"
              class="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-800 border border-green-200 rounded px-2 py-1 hover:border-green-400">
              <span class="font-mono font-semibold tracking-wide">{{ vehiclePlate(vehicle) }}</span>
              <span class="text-xs text-green-700/80">{{ vehicleModel(vehicle) }}</span>
            </RouterLink>
          </div>
          <p v-else class="mt-3 text-sm text-stone-500 italic">{{ $t('keys.noneAvailable') }}</p>
        </div>

        <div class="card">
          <p class="flex items-center gap-2 font-semibold text-stone-900">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500" />
            {{ $t('keys.takenCount', keysOut.length, { count: keysOut.length }) }}
          </p>
          <ul v-if="keysOut.length" class="mt-3 space-y-2">
            <li v-for="vehicle in keysOut" :key="vehicle.id"
              class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm border-l-2 border-amber-300 pl-2">
              <span class="plate">{{ vehicle.plate }}</span>
              <span class="text-xs text-stone-400">{{ vehicle.model }}</span>
              <span class="text-amber-800">{{ $t('keys.heldBy', { name: vehicle.holder }) }}</span>
              <span class="text-xs text-stone-400">{{ formatDateTime(vehicle.since) }}</span>
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-stone-500 italic">{{ $t('keys.noneTaken') }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ $t('dashboard.ongoingMissions') }}</h2>
      <div v-if="ongoingDetails.length" class="space-y-3">
        <div v-for="mission in ongoingDetails" :key="mission.id" class="card">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-stone-900">{{ mission.title }}</p>
              <p class="text-sm text-stone-500 mt-0.5">
                {{ formatDateTime(mission.startDate) }} → {{ formatDateTime(mission.endDate) }}
              </p>

              <div v-if="mission.assignedVehicles.length" class="mt-2 space-y-1">
                <div v-for="entry in mission.assignedVehicles" :key="entry.id"
                  class="flex items-center gap-1.5 text-sm text-stone-600">
                  <span class="font-mono">{{ entry.vehicle ? vehiclePlate(entry.vehicle) : $t('common.empty') }}</span>
                  <span class="text-stone-400">{{ entry.vehicle ? vehicleModel(entry.vehicle) : '' }}</span>
                  <template v-if="entry.driver">
                    <span class="text-stone-400">·</span>
                    <span>👤 {{ personName(entry.driver) }}</span>
                  </template>
                </div>
              </div>

              <div v-if="mission.unmountedStaff.length" class="mt-1.5 flex flex-wrap gap-1">
                <span v-for="person in mission.unmountedStaff" :key="person.id"
                  class="text-xs text-stone-600 bg-stone-100 rounded px-1.5 py-0.5">
                  👤 {{ personName(person) }}
                </span>
              </div>
            </div>
            <StatusBadge :status="MISSION_STATUS.ONGOING" />
          </div>
        </div>
      </div>
      <ListPlaceholder v-else :loading="!missionsStore.loaded" :message="$t('dashboard.noOngoingMission')" />
    </section>
  </div>
</template>
