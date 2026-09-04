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
import { vehiclePlate, vehicleModel } from '../../labels.js'
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
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <p class="plate text-lg">{{ vehiclePlate(vehicle) }}</p>
          <span class="text-sm text-stone-500">{{ vehicleModel(vehicle) }}</span>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1 items-center">
          <StatusBadge :status="status" />
          <span class="badge-gray">{{ $t(`vehicles.categories.${vehicle.category}`) }}</span>
          <span v-if="vehicle.seats" class="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-olive-50 text-olive-700">
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
              loanOverdue ? 'text-red-700 bg-red-50 border-red-200 font-medium' : 'text-stone-500 bg-stone-50 border-stone-200']">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ loanOverdue
              ? $t('vehicles.loanOverdue', { date: formatDateTime(vehicle.loanUntil) })
              : $t('vehicles.loanUntilLabel', { date: formatDateTime(vehicle.loanUntil) }) }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5 shrink-0">
        <button @click="$emit('key-take')" class="btn-action btn-action-key">
          {{ keyHolder ? $t('keys.transferShort') : $t('keys.takeShort') }}
        </button>
        <button v-if="keyHolder" @click="$emit('key-return')" class="btn-action btn-action-key"
          :title="$t('keys.returnFor', { name: keyHolderName })">
          {{ $t('keys.returnShort') }}
        </button>
        <button v-if="isFree" @click="$emit('lend')" class="btn-action">{{ $t('vehicles.loan.lend') }}</button>
        <button v-if="isOnLoan" @click="$emit('release')" class="btn-action">{{ $t('vehicles.loan.release') }}</button>
        <button @click="$emit('edit')" class="btn-action">{{ $t('actions.edit') }}</button>
        <button @click="$emit('delete')" class="btn-action btn-action-danger">{{ $t('actions.delete') }}</button>
      </div>
    </div>
  </div>
</template>
