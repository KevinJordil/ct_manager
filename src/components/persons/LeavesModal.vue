<script setup>
import { reactive, computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useClock } from '../../stores/clock.js'
import { formatDateTime } from '../../datetime.js'
import { personName } from '../../labels.js'

const props = defineProps({ person: { type: Object, required: true } })
defineEmits(['close'])

const store = usePersonsStore()
const { nowString } = useClock()
const form = reactive({ startDate: '', endDate: '' })

const invalidRange = computed(() =>
  Boolean(form.startDate && form.endDate && form.endDate < form.startDate)
)

function addLeave() {
  if (!form.startDate || !form.endDate || invalidRange.value) return
  store.addLeave(props.person.id, { startDate: form.startDate, endDate: form.endDate })
  form.startDate = ''
  form.endDate = ''
}

function removeLeave(id) {
  store.removeLeave(props.person.id, id)
}

/** past | current | upcoming */
function leaveState(leave) {
  const now = nowString.value
  if (leave.endDate < now) return 'past'
  if (leave.startDate <= now && now <= leave.endDate) return 'current'
  return 'upcoming'
}

const STATE_CLASSES = {
  current: 'bg-red-50 border-red-200 text-red-700',
  upcoming: 'bg-orange-50 border-orange-200 text-orange-700',
  past: 'bg-gray-50 border-gray-200 text-gray-500',
}

const sortedLeaves = computed(() =>
  [...(props.person.leaves ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate))
)
</script>

<template>
  <BaseModal :title="$t('persons.leaves.title', { name: personName(person) })" @close="$emit('close')">
    <div class="space-y-5">

      <div>
        <p class="text-sm font-medium text-gray-700 mb-2">{{ $t('persons.leaves.recorded') }}</p>
        <div v-if="sortedLeaves.length" class="space-y-2">
          <div v-for="leave in sortedLeaves" :key="leave.id"
            :class="['flex items-center justify-between p-2.5 border rounded-lg text-sm', STATE_CLASSES[leaveState(leave)]]">
            <div class="flex items-center gap-2 flex-wrap">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="font-medium">{{ formatDateTime(leave.startDate) }}</span>
              <span class="opacity-60">→</span>
              <span class="font-medium">{{ formatDateTime(leave.endDate) }}</span>
              <span class="text-xs opacity-60">({{ $t(`persons.leaves.${leaveState(leave)}`) }})</span>
            </div>
            <button @click="removeLeave(leave.id)" :aria-label="$t('actions.delete')"
              class="hover:opacity-70 transition-opacity ml-2 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 italic">{{ $t('persons.leaves.empty') }}</p>
      </div>

      <div class="border-t border-gray-100 pt-4">
        <p class="text-sm font-medium text-gray-700 mb-3">{{ $t('persons.leaves.addPeriod') }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="leave-start">{{ $t('missions.start') }}</label>
            <input id="leave-start" v-model="form.startDate" type="datetime-local" class="input" />
          </div>
          <div>
            <label class="label" for="leave-end">{{ $t('missions.end') }}</label>
            <input id="leave-end" v-model="form.endDate" type="datetime-local" class="input" :min="form.startDate" />
          </div>
        </div>
        <p v-if="invalidRange" class="mt-1.5 text-xs text-red-600">{{ $t('persons.leaves.invalidRange') }}</p>
        <button @click="addLeave"
          :disabled="!form.startDate || !form.endDate || invalidRange"
          class="mt-3 w-full justify-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          {{ $t('persons.leaves.addLeave') }}
        </button>
      </div>

      <div class="flex justify-end pt-1">
        <button @click="$emit('close')" class="btn-secondary">{{ $t('actions.close') }}</button>
      </div>
    </div>
  </BaseModal>
</template>
