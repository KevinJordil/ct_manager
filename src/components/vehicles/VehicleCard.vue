<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionsStore } from '../../stores/missions.js'
import { useClock } from '../../stores/clock.js'
import { getVehicleStatus, currentMissionOfVehicle } from '../../availability.js'
import { VEHICLE_STATUS } from '../../constants.js'
import StatusBadge from '../common/StatusBadge.vue'

const props = defineProps({ vehicle: { type: Object, required: true } })
defineEmits(['edit', 'delete', 'lend', 'release'])

const router = useRouter()
const missionsStore = useMissionsStore()
const { nowString } = useClock()

const currentMission = computed(() =>
  currentMissionOfVehicle(props.vehicle.id, missionsStore.missions, nowString.value)
)

const status = computed(() =>
  getVehicleStatus(props.vehicle, missionsStore.missions, nowString.value)
)

const isOnLoan = computed(() => props.vehicle.status === VEHICLE_STATUS.ON_LOAN)
const isFree = computed(() => status.value === VEHICLE_STATUS.FREE)
const isOnMission = computed(() => status.value === VEHICLE_STATUS.ON_MISSION)
</script>

<template>
  <div class="card">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-semibold text-gray-900">{{ vehicle.name }}</p>
          <span class="text-xs text-gray-500 font-mono">{{ vehicle.plate }}</span>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1 items-center">
          <StatusBadge :status="status" />
          <span class="badge-gray">{{ $t(`vehicles.categories.${vehicle.category}`) }}</span>
          <span v-if="vehicle.seats" class="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            {{ $t('vehicles.seatsShort', vehicle.seats, { count: vehicle.seats }) }}
          </span>
        </div>

        <div v-if="isOnMission && currentMission" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2 inline-flex items-center min-h-[36px] py-1 text-left">
            {{ currentMission.title }}
          </button>
        </div>

        <div v-if="isOnLoan && vehicle.loanNote" class="mt-2 text-sm text-red-600 italic">
          {{ vehicle.loanNote }}
        </div>
      </div>

      <div class="flex gap-1 shrink-0">
        <button v-if="isFree" @click="$emit('lend')" class="icon-btn"
          :title="$t('vehicles.loan.lend')" :aria-label="$t('vehicles.loan.lend')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
          </svg>
        </button>
        <button v-if="isOnLoan" @click="$emit('release')" class="icon-btn text-green-600 hover:text-green-800"
          :title="$t('vehicles.loan.release')" :aria-label="$t('vehicles.loan.releaseLabel')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </button>
        <button @click="$emit('edit')" :aria-label="$t('vehicles.edit')" :title="$t('actions.edit')" class="icon-btn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button @click="$emit('delete')" :aria-label="$t('vehicles.deleteTitle')" :title="$t('actions.delete')" class="icon-btn text-red-400 hover:text-red-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
