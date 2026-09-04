<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useClock } from '../../stores/clock.js'
import { personName } from '../../labels.js'

const props = defineProps({ vehicle: { type: Object, required: true } })
const emit = defineEmits(['save', 'close'])

const personsStore = usePersonsStore()
const { todayString } = useClock()

const date = ref(todayString.value)
const mode = ref('person') // 'person' | 'note'
const personId = ref('')
const note = ref('')

const sortedPersons = computed(() =>
  [...personsStore.persons].sort((a, b) => personName(a).localeCompare(personName(b)))
)

const canSubmit = computed(() => {
  if (!date.value) return false
  return mode.value === 'person' ? Boolean(personId.value) : Boolean(note.value.trim())
})

function submit() {
  if (!canSubmit.value) return
  emit('save', {
    date: date.value,
    personId: mode.value === 'person' ? personId.value : null,
    note: mode.value === 'note' ? note.value.trim() : '',
  })
}
</script>

<template>
  <BaseModal :title="$t('checks.record')" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-stone-600">
        {{ $t('checks.vehicle') }}
        <strong class="plate">{{ vehicle.plate }}</strong> <span class="text-stone-500">{{ vehicle.name }}</span>
      </p>

      <div>
        <label class="label" for="check-date">{{ $t('checks.date') }} *</label>
        <!-- A check cannot be recorded in the future. -->
        <input id="check-date" type="date" v-model="date" class="input" :max="todayString" required />
      </div>

      <div>
        <span class="label" id="check-mode-label">{{ $t('checks.doneBy') }}</span>
        <div class="flex gap-2 mb-3" role="group" aria-labelledby="check-mode-label">
          <button type="button" @click="mode = 'person'" :aria-pressed="mode === 'person'"
            :class="['flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors',
              mode === 'person' ? 'bg-olive-600 border-olive-600 text-white' : 'bg-white border-stone-300 text-stone-600 hover:border-olive-300']">
            {{ $t('checks.byPerson') }}
          </button>
          <button type="button" @click="mode = 'note'" :aria-pressed="mode === 'note'"
            :class="['flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors',
              mode === 'note' ? 'bg-olive-600 border-olive-600 text-white' : 'bg-white border-stone-300 text-stone-600 hover:border-olive-300']">
            {{ $t('checks.byNote') }}
          </button>
        </div>

        <select v-if="mode === 'person'" v-model="personId" class="input"
          :aria-label="$t('checks.doneBy')" required>
          <option value="">{{ $t('checks.selectPerson') }}</option>
          <option v-for="person in sortedPersons" :key="person.id" :value="person.id">
            {{ personName(person) }}
          </option>
        </select>

        <textarea v-else v-model="note" class="input" rows="2"
          :aria-label="$t('checks.doneBy')"
          :placeholder="$t('checks.notePlaceholder')" required />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="!canSubmit">{{ $t('actions.save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
