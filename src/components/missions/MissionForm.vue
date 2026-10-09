<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '../common/BaseModal.vue'
import DateTimeField from '../common/DateTimeField.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { useMissionsStore } from '../../stores/missions.js'
import { useClock } from '../../stores/clock.js'
import { useConfigStore } from '../../stores/config.js'
import {
  isPersonAvailable, isVehicleAvailable, isVehicleAwayDuring, isOnLeaveDuring,
  isPersonCommitted, isVehicleCommitted, getMissionStatus,
  isTrailerCommitted, trailerFit,
} from '../../availability.js'
import { useTrailersStore } from '../../stores/trailers.js'
import { MISSION_STATUS } from '../../constants.js'
import { personName } from '../../labels.js'
import { newId } from '../../id.js'

const props = defineProps({ mission: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const configStore = useConfigStore()
const trailersStore = useTrailersStore()
const { nowString } = useClock()
const { t } = useI18n()

// The form reads four stores; it loads them itself rather than assuming the
// view that opened it already did. init() is memoised, so this costs nothing
// when they are already loaded.
personsStore.init()
vehiclesStore.init()
missionsStore.init()
configStore.init()
trailersStore.init()

const form = reactive({ title: '', description: '', startDate: '', endDate: '', notes: '' })
const vehicleRows = ref([])
const staffRows = ref([])

/** How many people the latest date change removed, surfaced to the user. */
const droppedAssignments = ref(0)

watch(() => props.mission, mission => {
  if (mission) {
    form.title = mission.title ?? ''
    form.description = mission.description ?? ''
    form.startDate = mission.startDate ?? ''
    form.endDate = mission.endDate ?? ''
    form.notes = mission.notes ?? ''
    vehicleRows.value = (mission.vehicles ?? []).map(entry => ({
      rowId: newId(),
      id: entry.id,
      vehicleId: entry.vehicleId,
      driverId: entry.driverId ?? null,
      withTrailer: entry.withTrailer ?? false,
      trailerId: entry.trailerId ?? '',
      // Only set when the mission comes from a request: what was asked for,
      // and whether that line found a vehicle at all.
      requestedLabel: entry.requestedLabel ?? '',
      driverRequired: entry.driverRequired ?? false,
      unavailable: entry.unavailable ?? false,
    }))
    staffRows.value = (mission.staffIds ?? []).map(id => ({ rowId: newId(), personId: id }))
    droppedAssignments.value = 0
  } else {
    form.title = ''
    form.description = ''
    form.startDate = ''
    form.endDate = ''
    form.notes = ''
    vehicleRows.value = []
    staffRows.value = []
    droppedAssignments.value = 0
  }
}, { immediate: true })

// ── Availability ──

/** Shared options: conflicts caused by the mission being edited are ignored. */
function availabilityOptions() {
  return { excludeMissionId: props.mission?.id ?? null, now: nowString.value }
}

/**
 * `keepPersonId` keeps the person already chosen in a row selectable, so the
 * current value never vanishes from its own dropdown.
 */
function personIsAvailable(person, keepPersonId = null) {
  if (person.id === keepPersonId) return true
  return isPersonAvailableNow(person)
}

/** Plain availability, with no exemption — used to re-check existing choices. */
function isPersonAvailableNow(person) {
  return isPersonAvailable(person, missionsStore.missions, form.startDate, form.endDate, availabilityOptions())
}

function vehicleIsAvailable(vehicle, keepVehicleId = null) {
  if (vehicle.id === keepVehicleId) return true
  return isVehicleAvailable(vehicle, missionsStore.missions, form.startDate, form.endDate, availabilityOptions())
}

/** People already picked elsewhere in this form */
function alreadyPicked({ exceptVehicleRow = null, exceptStaffRow = null } = {}) {
  return new Set([
    ...vehicleRows.value
      .filter(row => row.rowId !== exceptVehicleRow)
      .map(row => row.driverId)
      .filter(Boolean),
    ...staffRows.value
      .filter(row => row.rowId !== exceptStaffRow)
      .map(row => row.personId)
      .filter(Boolean),
  ])
}

function vehiclesNotElsewhere(row) {
  const takenElsewhere = new Set(
    vehicleRows.value.filter(other => other.rowId !== row.rowId).map(other => other.vehicleId).filter(Boolean)
  )
  return vehiclesStore.vehicles.filter(vehicle => !takenElsewhere.has(vehicle.id))
}

function availableVehiclesFor(row) {
  return vehiclesNotElsewhere(row).filter(vehicle => vehicleIsAvailable(vehicle, row.vehicleId))
}

/**
 * The vehicles that are not free, offered apart with their reason: the
 * person planning may know better — a vehicle back early — and decides.
 */
function unavailableVehiclesFor(row) {
  return vehiclesNotElsewhere(row).filter(vehicle => !vehicleIsAvailable(vehicle, row.vehicleId))
}

/**
 * Licences that allow driving the row's vehicle. A vehicle without a known
 * category cannot be checked, so nobody counts as qualified for it.
 */
function requiredLicensesFor(row) {
  const vehicle = vehiclesStore.vehicles.find(v => v.id === row.vehicleId)
  if (!vehicle) return null
  const matrix = row.withTrailer ? configStore.trailerLicensesByCategory : configStore.licensesByCategory
  return matrix[vehicle.category] ?? []
}

function isQualified(person, row) {
  const required = requiredLicensesFor(row)
  if (!required) return true
  return (person.licenses ?? []).some(license => required.includes(license))
}

function driversNotElsewhere(row) {
  const taken = alreadyPicked({ exceptVehicleRow: row.rowId })
  return personsStore.persons.filter(person => person.id === row.driverId || !taken.has(person.id))
}

function availableDriversFor(row) {
  return driversNotElsewhere(row)
    .filter(person => personIsAvailable(person, row.driverId) && isQualified(person, row))
}

function unavailableDriversFor(row) {
  const available = new Set(availableDriversFor(row).map(person => person.id))
  return driversNotElsewhere(row).filter(person => !available.has(person.id))
}

function staffNotElsewhere(row) {
  const taken = alreadyPicked({ exceptStaffRow: row.rowId })
  return personsStore.persons.filter(person => person.id === row.personId || !taken.has(person.id))
}

function availableStaffFor(row) {
  return staffNotElsewhere(row).filter(person => personIsAvailable(person, row.personId))
}

function unavailableStaffFor(row) {
  return staffNotElsewhere(row).filter(person => !personIsAvailable(person, row.personId))
}

// ── Trailers ──

function rowVehicle(row) {
  return vehiclesStore.vehicles.find(vehicle => vehicle.id === row.vehicleId)
}

function trailersNotElsewhere(row) {
  const takenElsewhere = new Set(
    vehicleRows.value.filter(other => other.rowId !== row.rowId).map(other => other.trailerId).filter(Boolean))
  return trailersStore.trailers.filter(trailer => !takenElsewhere.has(trailer.id))
}

/** Why a trailer should not go behind this row's vehicle; empty when it can. */
function trailerProblems(trailer, row) {
  if (!trailer) return []
  const problems = []
  if (trailerFit(trailer, rowVehicle(row)) === 'no') problems.push('incompatible')
  if (isVehicleAwayDuring(trailer, form.startDate)) problems.push('away')
  if (form.startDate && form.endDate && isTrailerCommitted(trailer.id, otherLiveMissions(),
    form.startDate, form.endDate, { excludeMissionId: props.mission?.id ?? null })) problems.push('busy')
  return problems
}

function availableTrailersFor(row) {
  return trailersNotElsewhere(row).filter(trailer => !trailerProblems(trailer, row).length)
}

function unavailableTrailersFor(row) {
  return trailersNotElsewhere(row).filter(trailer => trailerProblems(trailer, row).length)
}

function onTrailerToggle(row) {
  if (!row.withTrailer) row.trailerId = ''
  dropDriverIfUnqualified(row)
}

// ── Problems, shown before saving rather than discovered afterwards ──

/** Missions that still tie resources up: not over, not cancelled, not this one. */
function otherLiveMissions() {
  return missionsStore.missions.filter(mission =>
    getMissionStatus(mission, nowString.value) !== MISSION_STATUS.COMPLETED)
}

/** Why a vehicle should not go, as translation keys; empty when it can. */
function vehicleProblems(vehicle) {
  if (!vehicle) return []
  const problems = []
  if (isVehicleAwayDuring(vehicle, form.startDate)) problems.push('away')
  if (form.startDate && form.endDate && isVehicleCommitted(vehicle.id, otherLiveMissions(),
    form.startDate, form.endDate, { excludeMissionId: props.mission?.id ?? null })) problems.push('busy')
  return problems
}

/** Why a person should not go — and, as a driver, whether they may drive it. */
function personProblems(person, row = null) {
  if (!person) return []
  const problems = []
  if (person.unavailable) problems.push('unavailable')
  if (isOnLeaveDuring(person, form.startDate, form.endDate)) problems.push('onLeave')
  if (form.startDate && form.endDate && isPersonCommitted(person.id, otherLiveMissions(),
    form.startDate, form.endDate, { excludeMissionId: props.mission?.id ?? null })) problems.push('busy')
  if (row && !isQualified(person, row)) problems.push('noLicense')
  return problems
}

const explain = problems => problems.map(problem => t(`missions.problems.${problem}`)).join(', ')

/** Every assignment that goes against a rule, in reading order. */
const conflicts = computed(() => {
  const lines = []
  for (const row of vehicleRows.value) {
    const vehicle = vehiclesStore.vehicles.find(v => v.id === row.vehicleId)
    const vehicleIssues = vehicleProblems(vehicle)
    if (vehicleIssues.length) lines.push({ key: `v-${row.rowId}`, name: vehicle.plate || vehicle.name, problems: explain(vehicleIssues) })
    const trailer = trailersStore.trailers.find(candidate => candidate.id === row.trailerId)
    const trailerIssues = row.withTrailer ? trailerProblems(trailer, row) : []
    if (trailerIssues.length) lines.push({ key: `t-${row.rowId}`, name: trailer.plate, problems: explain(trailerIssues) })
    const driver = personsStore.persons.find(p => p.id === row.driverId)
    const driverIssues = personProblems(driver, row)
    if (driverIssues.length) lines.push({ key: `d-${row.rowId}`, name: personName(driver), problems: explain(driverIssues) })
  }
  for (const row of staffRows.value) {
    const person = personsStore.persons.find(p => p.id === row.personId)
    const issues = personProblems(person)
    if (issues.length) lines.push({ key: `s-${row.rowId}`, name: personName(person), problems: explain(issues) })
  }
  return lines
})

// ── List mutations ──

function addVehicleRow() {
  vehicleRows.value.push({
    rowId: newId(), id: null, vehicleId: '', driverId: null, withTrailer: false, trailerId: '',
    requestedLabel: '', driverRequired: false, unavailable: false,
  })
}

/**
 * Hands the wheel to somebody at random among those who may drive this
 * vehicle and are free. Picking a name off a list of thirty is a chore that
 * carries no decision — any of them can drive it — so the form offers to
 * make the pick.
 */
function pickRandomDriver(row) {
  const candidates = availableDriversFor(row).filter(person => person.id !== row.driverId)
  if (!candidates.length) return
  row.driverId = candidates[Math.floor(Math.random() * candidates.length)].id
}

/** Every row that wants a driver and has none yet. */
const rowsMissingDriver = computed(() =>
  vehicleRows.value.filter(row => row.vehicleId && !row.driverId)
)

function fillMissingDrivers() {
  for (const row of rowsMissingDriver.value) pickRandomDriver(row)
}

function removeVehicleRow(rowId) {
  vehicleRows.value = vehicleRows.value.filter(row => row.rowId !== rowId)
}

function onVehicleChange(row) {
  row.withTrailer = false
  row.trailerId = ''
  // The row no longer waits for a vehicle; whatever the proposal said, a
  // choice has been made.
  row.unavailable = false
  dropDriverIfUnqualified(row)
}

function dropDriverIfUnqualified(row) {
  if (!row.driverId) return
  const driver = personsStore.persons.find(person => person.id === row.driverId)
  if (!driver || !isQualified(driver, row)) row.driverId = null
}

function addStaffRow() {
  staffRows.value.push({ rowId: newId(), personId: '' })
}

function removeStaffRow(rowId) {
  staffRows.value = staffRows.value.filter(row => row.rowId !== rowId)
}

/**
 * Changing the dates can invalidate people who were already picked. They are
 * dropped — and the count is surfaced, since silently losing an assignment
 * the user had made is worse than the conflict itself.
 */
watch([() => form.startDate, () => form.endDate], () => {
  if (!form.startDate || !form.endDate) return
  let dropped = 0

  // The exemption used by the dropdowns must not apply here: the whole point
  // is to re-examine the people already chosen.
  vehicleRows.value.forEach(row => {
    if (!row.driverId) return
    const person = personsStore.persons.find(p => p.id === row.driverId)
    if (!person || !isPersonAvailableNow(person)) {
      row.driverId = null
      dropped++
    }
  })

  const keptStaff = staffRows.value.filter(row => {
    if (!row.personId) return true
    const person = personsStore.persons.find(p => p.id === row.personId)
    return person && isPersonAvailableNow(person)
  })
  dropped += staffRows.value.length - keptStaff.length
  staffRows.value = keptStaff

  // A trailer chosen for the old dates may be hitched elsewhere on the new ones.
  vehicleRows.value.forEach(row => {
    if (!row.trailerId) return
    const trailer = trailersStore.trailers.find(candidate => candidate.id === row.trailerId)
    const issues = trailerProblems(trailer, row).filter(problem => problem !== 'incompatible')
    if (!trailer || issues.length) {
      row.trailerId = ''
      dropped++
    }
  })

  // A vehicle chosen for the old dates may be booked on the new ones.
  vehicleRows.value.forEach(row => {
    if (!row.vehicleId) return
    const vehicle = vehiclesStore.vehicles.find(v => v.id === row.vehicleId)
    if (!vehicle || !vehicleIsAvailable(vehicle)) {
      row.vehicleId = ''
      row.driverId = null
      dropped++
    }
  })

  // Accumulated, not replaced: setting the start date then the end date runs
  // this twice, and the second pass would otherwise erase the first warning.
  droppedAssignments.value += dropped
})

// ── Total capacity ──

const capacity = computed(() => {
  const picked = vehicleRows.value.filter(row => row.vehicleId)
  const seats = picked.reduce((total, row) => {
    const vehicle = vehiclesStore.vehicles.find(v => v.id === row.vehicleId)
    return total + (vehicle?.seats ?? 0)
  }, 0)
  return { seats, drivers: picked.filter(row => row.driverId).length }
})

/** A mission has to end after it starts, or it never runs and blocks nothing. */
const endBeforeStart = computed(() =>
  Boolean(form.startDate && form.endDate && form.endDate <= form.startDate))

/** Set once the person planning has read the conflicts and keeps them. */
const forcing = ref(false)
watch(conflicts, () => { forcing.value = false })

function submit() {
  if (!form.title.trim() || !form.startDate || !form.endDate || endBeforeStart.value) return
  if (conflicts.value.length && !forcing.value) {
    forcing.value = true
    return
  }
  emit('save', {
    ...form,
    vehicles: vehicleRows.value.filter(row => row.vehicleId).map(row => ({
      id: row.id ?? row.rowId,
      vehicleId: row.vehicleId,
      driverId: row.driverId || null,
      withTrailer: row.withTrailer ?? false,
      trailerId: row.withTrailer ? (row.trailerId || null) : null,
    })),
    staffIds: staffRows.value.map(row => row.personId).filter(Boolean),
  })
}
</script>

<template>
  <BaseModal persistent :title="mission?.id ? $t('missions.edit') : $t('missions.new')" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-5">

      <p v-if="droppedAssignments" role="status"
        class="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span class="flex-1">
          {{ $t('missions.droppedAssignments', droppedAssignments, { count: droppedAssignments }) }}
        </span>
        <button type="button" @click="droppedAssignments = 0" :aria-label="$t('actions.hide')"
          class="shrink-0 text-orange-500 hover:text-orange-700">✕</button>
      </p>

      <div class="space-y-3">
        <div>
          <label class="label" for="mission-title">{{ $t('missions.missionTitle') }} *</label>
          <input id="mission-title" v-model="form.title" class="input"
            :placeholder="$t('missions.titlePlaceholder')" required />
        </div>
        <div>
          <label class="label" for="mission-description">{{ $t('missions.description') }}</label>
          <textarea id="mission-description" v-model="form.description" class="input" rows="2"
            :placeholder="$t('missions.descriptionPlaceholder')" />
        </div>
        <div class="grid grid-cols-1 gap-3">
          <div>
            <label class="label" for="mission-start">{{ $t('missions.start') }} *</label>
            <DateTimeField id="mission-start" v-model="form.startDate" required />
          </div>
          <div>
            <label class="label" for="mission-end">{{ $t('missions.end') }} *</label>
            <DateTimeField id="mission-end" v-model="form.endDate"
              :min="form.startDate" default-time="17:00" required />
            <p v-if="endBeforeStart" role="alert" class="mt-1 text-xs font-medium text-red-700">
              {{ $t('missions.endBeforeStart') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Vehicles -->
      <div class="border border-stone-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-stone-700">{{ $t('missions.vehiclesSection') }}</h3>
            <span v-if="capacity.seats > 0 || capacity.drivers > 0"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-olive-100 text-olive-700">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {{ $t('missions.capacity', capacity.seats, { count: capacity.seats }) }}
              <span class="text-olive-400">+</span>
              {{ $t('missions.drivers', capacity.drivers, { count: capacity.drivers }) }}
            </span>
          </div>
          <div class="flex items-center gap-3">
          <button v-if="rowsMissingDriver.length > 1" type="button" @click="fillMissingDrivers"
            class="text-xs text-olive-600 hover:text-olive-800 font-medium min-h-[36px] px-2">
            {{ $t('missions.fillDrivers') }}
          </button>
          <button type="button" @click="addVehicleRow"
            class="text-xs text-olive-600 hover:text-olive-800 font-medium flex items-center gap-1 min-h-[36px] px-2 -mr-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            {{ $t('actions.add') }}
          </button>
          </div>
        </div>
        <div v-if="vehicleRows.length" class="divide-y divide-stone-100">
          <div v-for="row in vehicleRows" :key="row.rowId" class="p-3 space-y-2">
            <p v-if="row.requestedLabel" class="flex flex-wrap items-center gap-1.5 text-xs">
              <span class="text-stone-500">{{ $t('missions.requested', { type: row.requestedLabel }) }}</span>
              <span v-if="row.driverRequired" class="badge-gray">{{ $t('requests.driverRequired') }}</span>
              <span v-if="row.unavailable"
                class="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">
                {{ $t('missions.noneOfThisType') }}
              </span>
              <span v-else-if="row.vehicleId"
                class="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                {{ $t('missions.proposedAvailable') }}
              </span>
            </p>
            <div class="flex gap-2 items-start">
              <select v-model="row.vehicleId" @change="onVehicleChange(row)" class="input text-sm flex-1"
                :aria-label="$t('missions.vehiclesSection')">
                <option value="">{{ $t('common.selectVehicle') }}</option>
                <option v-for="vehicle in availableVehiclesFor(row)" :key="vehicle.id" :value="vehicle.id">
                  {{ vehicle.plate }} — {{ vehicle.name }}{{ vehicle.seats ? ` — ${$t('missions.capacity', vehicle.seats, { count: vehicle.seats })}` : '' }}
                </option>
                <optgroup v-if="unavailableVehiclesFor(row).length" :label="$t('missions.unavailableGroup')">
                  <option v-for="vehicle in unavailableVehiclesFor(row)" :key="vehicle.id" :value="vehicle.id">
                    {{ vehicle.plate }} — {{ vehicle.name }} ({{ explain(vehicleProblems(vehicle)) }})
                  </option>
                </optgroup>
              </select>
              <button type="button" @click="removeVehicleRow(row.rowId)" :aria-label="$t('missions.removeVehicle')"
                class="mt-1 icon-btn text-red-400 hover:text-red-600 shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div v-if="row.vehicleId" class="space-y-2">
              <label class="flex items-center gap-2 cursor-pointer w-fit">
                <input type="checkbox" v-model="row.withTrailer" @change="onTrailerToggle(row)"
                  class="w-4 h-4 rounded border-stone-300 text-olive-600 focus:ring-olive-500" />
                <span class="text-sm text-stone-700">{{ $t('missions.withTrailer') }}</span>
                <span v-if="row.withTrailer" class="text-xs text-olive-600 font-medium">
                  {{ $t('missions.trailerLicense') }}
                </span>
              </label>
              <div v-if="row.withTrailer">
                <select v-model="row.trailerId" class="input text-sm w-full" :aria-label="$t('missions.trailer')">
                  <option value="">{{ $t('missions.trailerUnspecified') }}</option>
                  <option v-for="trailer in availableTrailersFor(row)" :key="trailer.id" :value="trailer.id">
                    {{ trailer.plate }}{{ trailer.name ? ` — ${trailer.name}` : '' }}
                  </option>
                  <optgroup v-if="unavailableTrailersFor(row).length" :label="$t('missions.unavailableGroup')">
                    <option v-for="trailer in unavailableTrailersFor(row)" :key="trailer.id" :value="trailer.id">
                      {{ trailer.plate }}{{ trailer.name ? ` — ${trailer.name}` : '' }} ({{ explain(trailerProblems(trailer, row)) }})
                    </option>
                  </optgroup>
                </select>
                <p v-if="row.trailerId && trailerFit(trailersStore.trailers.find(t => t.id === row.trailerId), rowVehicle(row)) === 'unknown'"
                  class="mt-1 text-xs text-stone-600">{{ $t('missions.trailerUnverified') }}</p>
              </div>
              <div class="flex gap-2">
                <select v-model="row.driverId" class="input text-sm flex-1" :aria-label="$t('fields.driverId')">
                  <option :value="null">{{ $t('missions.noDriverOption') }}</option>
                  <option v-for="person in availableDriversFor(row)" :key="person.id" :value="person.id">
                    {{ personName(person) }} ({{ (person.licenses ?? []).join(', ') }})
                  </option>
                  <optgroup v-if="unavailableDriversFor(row).length" :label="$t('missions.unavailableGroup')">
                    <option v-for="person in unavailableDriversFor(row)" :key="person.id" :value="person.id">
                      {{ personName(person) }} ({{ explain(personProblems(person, row)) }})
                    </option>
                  </optgroup>
                </select>
                <button type="button" @click="pickRandomDriver(row)"
                  :disabled="availableDriversFor(row).length === 0"
                  class="btn-action shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                  {{ $t('missions.randomDriver') }}
                </button>
              </div>
              <p v-if="requiredLicensesFor(row)" class="text-xs text-stone-400">
                {{ $t('missions.requiredLicenses', { list: requiredLicensesFor(row).join(', ') }) }}
              </p>
              <p v-if="form.startDate && form.endDate && availableDriversFor(row).length === 0"
                class="text-xs text-orange-600">{{ $t('missions.noQualifiedDriver') }}</p>
            </div>
            <p v-else class="text-xs text-stone-400 italic">{{ $t('missions.pickVehicleFirst') }}</p>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-stone-400 italic text-center">{{ $t('missions.noVehicleAdded') }}</p>
      </div>

      <!-- Unmounted staff -->
      <div class="border border-stone-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200">
          <h3 class="text-sm font-semibold text-stone-700">{{ $t('missions.staffSection') }}</h3>
          <button type="button" @click="addStaffRow"
            class="text-xs text-olive-600 hover:text-olive-800 font-medium flex items-center gap-1 min-h-[36px] px-2 -mr-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            {{ $t('actions.add') }}
          </button>
        </div>
        <div v-if="staffRows.length" class="divide-y divide-stone-100">
          <div v-for="row in staffRows" :key="row.rowId" class="flex gap-2 items-center p-3">
            <select v-model="row.personId" class="input text-sm flex-1" :aria-label="$t('missions.staffSection')">
              <option value="">{{ $t('common.selectPerson') }}</option>
              <option v-for="person in availableStaffFor(row)" :key="person.id" :value="person.id">
                {{ personName(person) }}
              </option>
              <optgroup v-if="unavailableStaffFor(row).length" :label="$t('missions.unavailableGroup')">
                <option v-for="person in unavailableStaffFor(row)" :key="person.id" :value="person.id">
                  {{ personName(person) }} ({{ explain(personProblems(person)) }})
                </option>
              </optgroup>
            </select>
            <button type="button" @click="removeStaffRow(row.rowId)" :aria-label="$t('missions.removeStaff')"
              class="icon-btn text-red-400 hover:text-red-600 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-stone-400 italic text-center">{{ $t('missions.noStaffAdded') }}</p>
      </div>

      <div>
        <label class="label" for="mission-notes">{{ $t('missions.notes') }}</label>
        <textarea id="mission-notes" v-model="form.notes" class="input" rows="2"
          :placeholder="$t('missions.notesPlaceholder')" />
      </div>

      <div v-if="conflicts.length" role="status"
        class="px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900 space-y-1">
        <p class="font-semibold">{{ $t('missions.conflictsTitle') }}</p>
        <ul class="list-disc pl-5">
          <li v-for="line in conflicts" :key="line.key">{{ line.name }} : {{ line.problems }}</li>
        </ul>
        <p v-if="forcing" class="font-medium">{{ $t('missions.forceHint') }}</p>
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" :class="forcing ? 'btn-danger' : 'btn-primary'">
          {{ forcing ? $t('missions.forceSave') : (mission?.id ? $t('actions.save') : $t('actions.create')) }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
