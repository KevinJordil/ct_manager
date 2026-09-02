<script setup>
import { reactive, ref, computed, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { useMissionsStore } from '../../stores/missions.js'
import { useClock } from '../../stores/clock.js'
import { isPersonAvailable, isVehicleAvailable } from '../../availability.js'
import { LICENSES_BY_CATEGORY, TRAILER_LICENSES_BY_CATEGORY } from '../../constants.js'
import { personName } from '../../labels.js'
import { newId } from '../../id.js'

const props = defineProps({ mission: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const { nowString } = useClock()

const form = reactive({ title: '', description: '', startDate: '', endDate: '', notes: '' })
const vehicleRows = ref([])
const staffRows = ref([])

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
    }))
    staffRows.value = (mission.staffIds ?? []).map(id => ({ rowId: newId(), personId: id }))
  } else {
    form.title = ''
    form.description = ''
    form.startDate = ''
    form.endDate = ''
    form.notes = ''
    vehicleRows.value = []
    staffRows.value = []
  }
}, { immediate: true })

// ── Availability ──

/** Shared options: conflicts caused by the mission being edited are ignored. */
function availabilityOptions() {
  return { excludeMissionId: props.mission?.id ?? null, now: nowString.value }
}

function personIsAvailable(person, keepPersonId = null) {
  if (person.id === keepPersonId) return true
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

function availableVehiclesFor(row) {
  const takenElsewhere = new Set(
    vehicleRows.value.filter(other => other.rowId !== row.rowId).map(other => other.vehicleId).filter(Boolean)
  )
  return vehiclesStore.vehicles.filter(vehicle => {
    if (takenElsewhere.has(vehicle.id)) return false
    return vehicleIsAvailable(vehicle, row.vehicleId)
  })
}

function requiredLicensesFor(row) {
  const vehicle = vehiclesStore.vehicles.find(v => v.id === row.vehicleId)
  if (!vehicle) return null
  return row.withTrailer
    ? TRAILER_LICENSES_BY_CATEGORY[vehicle.category]
    : LICENSES_BY_CATEGORY[vehicle.category]
}

function availableDriversFor(row) {
  const required = requiredLicensesFor(row)
  const taken = alreadyPicked({ exceptVehicleRow: row.rowId })
  return personsStore.persons.filter(person => {
    if (person.id !== row.driverId && taken.has(person.id)) return false
    if (!personIsAvailable(person, row.driverId)) return false
    if (required && !person.licenses.some(license => required.includes(license))) return false
    return true
  })
}

function availableStaffFor(row) {
  const taken = alreadyPicked({ exceptStaffRow: row.rowId })
  return personsStore.persons.filter(person => {
    if (person.id !== row.personId && taken.has(person.id)) return false
    return personIsAvailable(person, row.personId)
  })
}

// ── List mutations ──

function addVehicleRow() {
  vehicleRows.value.push({ rowId: newId(), id: null, vehicleId: '', driverId: null, withTrailer: false })
}

function removeVehicleRow(rowId) {
  vehicleRows.value = vehicleRows.value.filter(row => row.rowId !== rowId)
}

function onVehicleChange(row) {
  row.withTrailer = false
  dropDriverIfUnqualified(row)
}

function dropDriverIfUnqualified(row) {
  if (!row.driverId) return
  if (!availableDriversFor(row).find(person => person.id === row.driverId)) row.driverId = null
}

function addStaffRow() {
  staffRows.value.push({ rowId: newId(), personId: '' })
}

function removeStaffRow(rowId) {
  staffRows.value = staffRows.value.filter(row => row.rowId !== rowId)
}

// Changing the dates can invalidate people who were already picked.
watch([() => form.startDate, () => form.endDate], () => {
  if (!form.startDate || !form.endDate) return
  vehicleRows.value.forEach(row => {
    if (!row.driverId) return
    const person = personsStore.persons.find(p => p.id === row.driverId)
    if (!person || !personIsAvailable(person, row.driverId)) row.driverId = null
  })
  staffRows.value = staffRows.value.filter(row => {
    if (!row.personId) return true
    const person = personsStore.persons.find(p => p.id === row.personId)
    return person && personIsAvailable(person, row.personId)
  })
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

function submit() {
  if (!form.title.trim() || !form.startDate || !form.endDate) return
  emit('save', {
    ...form,
    vehicles: vehicleRows.value.filter(row => row.vehicleId).map(row => ({
      id: row.id ?? row.rowId,
      vehicleId: row.vehicleId,
      driverId: row.driverId || null,
      withTrailer: row.withTrailer ?? false,
    })),
    staffIds: staffRows.value.map(row => row.personId).filter(Boolean),
  })
}
</script>

<template>
  <BaseModal :title="mission?.id ? $t('missions.edit') : $t('missions.new')" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-5">

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
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="mission-start">{{ $t('missions.start') }} *</label>
            <input id="mission-start" v-model="form.startDate" type="datetime-local" class="input" required />
          </div>
          <div>
            <label class="label" for="mission-end">{{ $t('missions.end') }} *</label>
            <input id="mission-end" v-model="form.endDate" type="datetime-local" class="input"
              :min="form.startDate" required />
          </div>
        </div>
      </div>

      <!-- Vehicles -->
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-700">{{ $t('missions.vehiclesSection') }}</h3>
            <span v-if="capacity.seats > 0 || capacity.drivers > 0"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {{ $t('missions.capacity', { seats: capacity.seats }) }}
              <span class="text-blue-400">+</span>
              {{ $t('missions.drivers', capacity.drivers, { count: capacity.drivers }) }}
            </span>
          </div>
          <button type="button" @click="addVehicleRow"
            class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            {{ $t('actions.add') }}
          </button>
        </div>
        <div v-if="vehicleRows.length" class="divide-y divide-gray-100">
          <div v-for="row in vehicleRows" :key="row.rowId" class="p-3 space-y-2">
            <div class="flex gap-2 items-start">
              <select v-model="row.vehicleId" @change="onVehicleChange(row)" class="input text-sm flex-1"
                :aria-label="$t('missions.vehiclesSection')">
                <option value="">{{ $t('common.selectVehicle') }}</option>
                <option v-for="vehicle in availableVehiclesFor(row)" :key="vehicle.id" :value="vehicle.id">
                  {{ vehicle.name }} {{ vehicle.plate }}{{ vehicle.seats ? ` — ${$t('missions.capacity', { seats: vehicle.seats })}` : '' }}
                </option>
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
                <input type="checkbox" v-model="row.withTrailer" @change="dropDriverIfUnqualified(row)"
                  class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm text-gray-700">{{ $t('missions.withTrailer') }}</span>
                <span v-if="row.withTrailer" class="text-xs text-blue-600 font-medium">
                  {{ $t('missions.trailerLicense') }}
                </span>
              </label>
              <select v-model="row.driverId" class="input text-sm" :aria-label="$t('fields.driverId')">
                <option :value="null">{{ $t('missions.noDriverOption') }}</option>
                <option v-for="person in availableDriversFor(row)" :key="person.id" :value="person.id">
                  {{ personName(person) }} ({{ person.licenses.join(', ') }})
                </option>
              </select>
              <p v-if="requiredLicensesFor(row)" class="text-xs text-gray-400">
                {{ $t('missions.requiredLicenses', { list: requiredLicensesFor(row).join(', ') }) }}
              </p>
              <p v-if="form.startDate && form.endDate && availableDriversFor(row).length === 0"
                class="text-xs text-orange-600">{{ $t('missions.noQualifiedDriver') }}</p>
            </div>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-gray-400 italic text-center">{{ $t('missions.noVehicleAdded') }}</p>
      </div>

      <!-- Unmounted staff -->
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700">{{ $t('missions.staffSection') }}</h3>
          <button type="button" @click="addStaffRow"
            class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            {{ $t('actions.add') }}
          </button>
        </div>
        <div v-if="staffRows.length" class="divide-y divide-gray-100">
          <div v-for="row in staffRows" :key="row.rowId" class="flex gap-2 items-center p-3">
            <select v-model="row.personId" class="input text-sm flex-1" :aria-label="$t('missions.staffSection')">
              <option value="">{{ $t('common.selectPerson') }}</option>
              <option v-for="person in availableStaffFor(row)" :key="person.id" :value="person.id">
                {{ personName(person) }}
              </option>
            </select>
            <button type="button" @click="removeStaffRow(row.rowId)" :aria-label="$t('missions.removeStaff')"
              class="icon-btn text-red-400 hover:text-red-600 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-gray-400 italic text-center">{{ $t('missions.noStaffAdded') }}</p>
      </div>

      <div>
        <label class="label" for="mission-notes">{{ $t('missions.notes') }}</label>
        <textarea id="mission-notes" v-model="form.notes" class="input" rows="2"
          :placeholder="$t('missions.notesPlaceholder')" />
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ mission?.id ? $t('actions.save') : $t('actions.create') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
