<script setup>
import { computed } from 'vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { useClock } from '../../stores/clock.js'
import { formatDateTime } from '../../datetime.js'
import { getMissionStatus } from '../../availability.js'
import { personName, vehiclePlate, vehicleModel } from '../../labels.js'
import StatusBadge from '../common/StatusBadge.vue'

const props = defineProps({
  mission: { type: Object, required: true },
  canManage: { type: Boolean, default: false },
})
defineEmits(['edit', 'delete', 'print'])

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const { nowString } = useClock()

const status = computed(() => getMissionStatus(props.mission, nowString.value))

const assignedVehicles = computed(() =>
  (props.mission.vehicles ?? []).filter(entry => entry.vehicleId).map(entry => ({
    ...entry,
    vehicle: vehiclesStore.vehicles.find(v => v.id === entry.vehicleId),
    driver: entry.driverId ? personsStore.persons.find(p => p.id === entry.driverId) : null,
  }))
)

const unmountedStaff = computed(() =>
  (props.mission.staffIds ?? [])
    .map(id => personsStore.persons.find(p => p.id === id))
    .filter(Boolean)
)
</script>

<template>
  <div class="card">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-semibold text-stone-900">{{ mission.title }}</p>
          <StatusBadge :status="status" />
        </div>
        <p v-if="mission.description" class="mt-1 text-sm text-stone-500 truncate">{{ mission.description }}</p>

        <p class="mt-1.5 flex items-center gap-1 text-sm text-stone-500">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {{ formatDateTime(mission.startDate) }} → {{ formatDateTime(mission.endDate) }}
        </p>

        <div v-if="assignedVehicles.length" class="mt-2 space-y-1">
          <div v-for="entry in assignedVehicles" :key="entry.id" class="flex items-center gap-1.5 text-sm text-stone-600">
            <svg class="w-3.5 h-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7 0h6m-3-3v6"/>
            </svg>
            <span class="font-mono font-semibold">{{ entry.vehicle ? vehiclePlate(entry.vehicle) : $t('common.empty') }}</span>
            <span class="text-stone-400">{{ entry.vehicle ? vehicleModel(entry.vehicle) : '' }}</span>
            <template v-if="entry.driver">
              <span class="text-stone-400">·</span>
              <svg class="w-3.5 h-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <span>{{ personName(entry.driver) }}</span>
            </template>
            <span v-else class="text-xs text-stone-400 italic">{{ $t('missions.noDriver') }}</span>
            <span v-if="entry.withTrailer" class="text-xs bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-medium">
              {{ $t('missions.trailerBadge') }}
            </span>
          </div>
        </div>

        <div v-if="unmountedStaff.length" class="mt-1.5 flex flex-wrap gap-1.5">
          <span v-for="person in unmountedStaff" :key="person.id"
            class="inline-flex items-center gap-1 text-xs text-stone-600 bg-stone-100 rounded px-1.5 py-0.5">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            {{ personName(person) }}
          </span>
        </div>

        <p v-if="mission.notes" class="mt-1.5 text-sm text-stone-400 italic">{{ mission.notes }}</p>
      </div>

      <div class="flex flex-wrap gap-1.5 shrink-0">
        <button @click="$emit('print')" class="btn-action">{{ $t('printing.short') }}</button>
        <button v-if="canManage" @click="$emit('edit')" class="btn-action">{{ $t('actions.edit') }}</button>
        <button v-if="canManage" @click="$emit('delete')" class="btn-action btn-action-danger">{{ $t('actions.delete') }}</button>
      </div>
    </div>
  </div>
</template>
