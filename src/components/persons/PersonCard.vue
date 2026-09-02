<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StatusBadge from '../common/StatusBadge.vue'
import { useMissionsStore } from '../../stores/missions.js'
import { useClock } from '../../stores/clock.js'
import { formatDateTime } from '../../datetime.js'
import { getDisplayedPersonStatus, currentMissionOfPerson } from '../../availability.js'
import { personName, LICENSE_COLORS } from '../../labels.js'

const props = defineProps({ person: { type: Object, required: true } })
defineEmits(['edit', 'delete', 'manage-leaves', 'toggle-unavailable'])

const router = useRouter()
const missionsStore = useMissionsStore()
const { nowString } = useClock()
const { t } = useI18n()

const currentMission = computed(() =>
  currentMissionOfPerson(props.person.id, missionsStore.missions, nowString.value)
)

const status = computed(() =>
  getDisplayedPersonStatus(props.person, missionsStore.missions, nowString.value)
)

const openLeaves = computed(() =>
  (props.person.leaves ?? []).filter(l => l.endDate >= nowString.value)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
)

const unavailabilityLabel = computed(() =>
  props.person.unavailable
    ? t('persons.unavailability.clear')
    : t('persons.unavailability.mark')
)
</script>

<template>
  <div class="card">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-900">
          <span v-if="person.rank" class="text-gray-500 font-normal text-sm mr-1">{{ person.rank }}</span>
          {{ person.firstName }} {{ person.lastName }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <StatusBadge :status="status" />
          <span v-for="license in person.licenses" :key="license"
            :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', LICENSE_COLORS[license] ?? 'bg-gray-100 text-gray-700']">
            {{ license }}
          </span>
        </div>

        <div v-if="currentMission" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2">
            {{ currentMission.title }}
          </button>
        </div>

        <div v-if="person.unavailable && person.unavailabilityNote"
          class="mt-2 inline-flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          {{ person.unavailabilityNote }}
        </div>

        <div v-if="openLeaves.length" class="mt-2 flex flex-col gap-1">
          <div v-for="leave in openLeaves" :key="leave.id"
            class="inline-flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 w-fit">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ formatDateTime(leave.startDate) }} → {{ formatDateTime(leave.endDate) }}
          </div>
        </div>

        <p v-if="person.notes" class="mt-2 text-sm text-gray-500 italic">{{ person.notes }}</p>
      </div>

      <div class="flex gap-1 shrink-0">
        <button @click="$emit('toggle-unavailable')"
          :class="['icon-btn', person.unavailable ? 'text-yellow-500 hover:text-yellow-700' : '']"
          :title="unavailabilityLabel" :aria-label="unavailabilityLabel">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
          </svg>
        </button>
        <button @click="$emit('manage-leaves')" class="icon-btn"
          :title="$t('persons.leaves.manage')" :aria-label="$t('persons.leaves.manage')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </button>
        <button @click="$emit('edit')" :aria-label="$t('persons.edit')" :title="$t('actions.edit')" class="icon-btn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button @click="$emit('delete')" :aria-label="$t('persons.deleteTitle')" :title="$t('actions.delete')" class="icon-btn text-red-400 hover:text-red-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
