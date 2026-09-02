<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePersonsStore } from '../stores/persons.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { useClock } from '../stores/clock.js'
import { formatDateTime } from '../datetime.js'
import {
  getPersonStatus, getVehicleStatus, isOnLeaveDuring,
  missionInvolvesPerson, ongoingMissions,
} from '../availability.js'
import { MISSION_STATUS, PERSON_STATUS, VEHICLE_STATUS } from '../constants.js'
import { personName } from '../labels.js'
import StatusBadge from '../components/common/StatusBadge.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const { nowString } = useClock()
const { t } = useI18n()

onMounted(() => {
  personsStore.init()
  vehiclesStore.init()
  missionsStore.init()
})

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
          mission: mission.title, vehicle: vehicle.name,
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

    <section>
      <h2 class="section-title">{{ $t('dashboard.ongoingMissions') }}</h2>
      <div v-if="ongoingDetails.length" class="space-y-3">
        <div v-for="mission in ongoingDetails" :key="mission.id" class="card">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-gray-900">{{ mission.title }}</p>
              <p class="text-sm text-gray-500 mt-0.5">
                {{ formatDateTime(mission.startDate) }} → {{ formatDateTime(mission.endDate) }}
              </p>

              <div v-if="mission.assignedVehicles.length" class="mt-2 space-y-1">
                <div v-for="entry in mission.assignedVehicles" :key="entry.id"
                  class="flex items-center gap-1.5 text-sm text-gray-600">
                  <span>🚗 {{ entry.vehicle?.name ?? $t('common.empty') }}</span>
                  <template v-if="entry.driver">
                    <span class="text-gray-400">·</span>
                    <span>👤 {{ personName(entry.driver) }}</span>
                  </template>
                </div>
              </div>

              <div v-if="mission.unmountedStaff.length" class="mt-1.5 flex flex-wrap gap-1">
                <span v-for="person in mission.unmountedStaff" :key="person.id"
                  class="text-xs text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
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
