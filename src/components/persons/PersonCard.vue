<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StatusBadge from '../common/StatusBadge.vue'
import { useMissionsStore } from '../../stores/missions.js'
import { usePersonsStore } from '../../stores/persons.js'
import { useClock } from '../../stores/clock.js'
import { formatDateTime } from '../../datetime.js'
import { getDisplayedPersonStatus, currentMissionOfPerson } from '../../availability.js'
import { personName, LICENSE_COLORS } from '../../labels.js'

const props = defineProps({
  person: { type: Object, required: true },
  // Recording an absence is daily work; changing the record is granted.
  canManage: { type: Boolean, default: false },
})
defineEmits(['edit', 'delete', 'manage-leaves', 'toggle-unavailable'])

const router = useRouter()
const missionsStore = useMissionsStore()
const personsStore = usePersonsStore()
const { nowString } = useClock()
const { t } = useI18n()

const currentMission = computed(() =>
  currentMissionOfPerson(props.person.id, missionsStore.missions, nowString.value)
)

const status = computed(() =>
  getDisplayedPersonStatus(props.person, missionsStore.missions, nowString.value)
)

const hasAccount = computed(() => personsStore.hasAccount(props.person.id))

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
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-stone-900">
          <span v-if="person.rank" class="text-stone-500 font-normal text-sm mr-1">{{ person.rank }}</span>
          {{ person.firstName }} {{ person.lastName }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <StatusBadge :status="status" />
          <span :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            hasAccount ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500']">
            {{ hasAccount ? $t('persons.accountActive') : $t('persons.noAccount') }}
          </span>
          <span v-for="license in person.licenses" :key="license"
            :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', LICENSE_COLORS[license] ?? 'bg-stone-100 text-stone-700']">
            {{ license }}
          </span>
        </div>

        <p v-if="person.phone" class="mt-1.5 text-sm text-stone-500">
          <a :href="`tel:${person.phone.replace(/\s/g, '')}`"
            class="inline-flex items-center gap-1.5 min-h-[36px] hover:text-olive-600 transition-colors">
            <svg class="w-3.5 h-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            {{ person.phone }}
          </a>
        </p>

        <div v-if="currentMission" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2 inline-flex items-center min-h-[36px] py-1 text-left">
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

        <p v-if="person.notes" class="mt-2 text-sm text-stone-500 italic">{{ person.notes }}</p>
      </div>

      <div class="flex flex-wrap gap-1.5 shrink-0">
        <button @click="$emit('toggle-unavailable')"
          :class="['btn-action', person.unavailable ? 'border-amber-300 bg-amber-50 text-amber-800' : '']">
          {{ unavailabilityLabel }}
        </button>
        <button @click="$emit('manage-leaves')" class="btn-action">{{ $t('persons.leaves.short') }}</button>
        <button v-if="canManage" @click="$emit('edit')" class="btn-action">{{ $t('actions.edit') }}</button>
        <button v-if="canManage" @click="$emit('delete')" class="btn-action btn-action-danger">{{ $t('actions.delete') }}</button>
      </div>
    </div>
  </div>
</template>
