<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionsStore } from '../../stores/missions.js'
import { usePersonsStore } from '../../stores/persons.js'
import { useClock } from '../../stores/clock.js'
import { getVehicleStatus, currentMissionOfVehicle } from '../../availability.js'
import { formatDateTime } from '../../datetime.js'
import { VEHICLE_STATUS } from '../../constants.js'
import { holderName } from '../../keys.js'
import StatusBadge from '../common/StatusBadge.vue'

const props = defineProps({ vehicle: { type: Object, required: true } })
defineEmits(['edit', 'delete', 'lend', 'release', 'key-take', 'key-return', 'key-history'])

const router = useRouter()
const missionsStore = useMissionsStore()
const personsStore = usePersonsStore()
const { nowString, todayString } = useClock()

const currentMission = computed(() =>
  currentMissionOfVehicle(props.vehicle.id, missionsStore.missions, nowString.value)
)

const status = computed(() =>
  getVehicleStatus(props.vehicle, missionsStore.missions, nowString.value)
)

const isOnLoan = computed(() => props.vehicle.status === VEHICLE_STATUS.ON_LOAN)
const isFree = computed(() => status.value === VEHICLE_STATUS.FREE)
const isOnMission = computed(() => status.value === VEHICLE_STATUS.ON_MISSION)

const keyHolder = computed(() => props.vehicle.keyHolder ?? null)
const keyHolderName = computed(() => holderName(keyHolder.value, personsStore.persons))

/** A loan whose expected return date has passed. */
const loanOverdue = computed(() =>
  isOnLoan.value && props.vehicle.loanUntil && props.vehicle.loanUntil < todayString.value
)
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

        <button type="button" @click="$emit('key-history')"
          :class="['mt-2 flex items-center gap-1.5 text-sm rounded px-2 py-1 border w-full sm:w-auto text-left min-h-[36px]',
            keyHolder ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800']"
          :title="$t('keys.historyHint')">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
          <span class="min-w-0 truncate">
            {{ keyHolder ? $t('keys.heldBy', { name: keyHolderName }) : $t('keys.onBoard') }}
          </span>
        </button>

        <div v-if="isOnMission && currentMission" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2 inline-flex items-center min-h-[36px] py-1 text-left">
            {{ currentMission.title }}
          </button>
        </div>

        <div v-if="isOnLoan" class="mt-2 space-y-1">
          <p v-if="vehicle.loanNote" class="text-sm text-red-600 italic">{{ vehicle.loanNote }}</p>
          <p v-if="vehicle.loanUntil"
            :class="['text-xs inline-flex items-center gap-1.5 rounded px-2 py-1 border',
              loanOverdue ? 'text-red-700 bg-red-50 border-red-200 font-medium' : 'text-gray-500 bg-gray-50 border-gray-200']">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ loanOverdue
              ? $t('vehicles.loanOverdue', { date: formatDateTime(vehicle.loanUntil) })
              : $t('vehicles.loanUntilLabel', { date: formatDateTime(vehicle.loanUntil) }) }}
          </p>
        </div>
      </div>

      <div class="flex gap-1 shrink-0">
        <button @click="$emit('key-take')" class="icon-btn text-amber-500 hover:text-amber-700"
          :title="keyHolder ? $t('keys.transferTitle') : $t('keys.takeTitle')"
          :aria-label="keyHolder ? $t('keys.transferTitle') : $t('keys.takeTitle')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </button>
        <button v-if="keyHolder" @click="$emit('key-return')" class="icon-btn text-green-600 hover:text-green-800"
          :title="$t('keys.returnFor', { name: keyHolderName })"
          :aria-label="$t('keys.returnFor', { name: keyHolderName })">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h11m0 0l-4-4m4 4l-4 4m10-9v14"/>
          </svg>
        </button>
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
