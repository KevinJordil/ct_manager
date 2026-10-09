<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import DateField from '../common/DateField.vue'
import { useClock } from '../../stores/clock.js'

/**
 * Takes a vehicle away from the fleet: lent out (`on-loan`), or out of
 * service (`out-of-service`), in which case the reason is chosen — in the
 * workshop, or broken down.
 */
const props = defineProps({
  vehicle: { type: Object, required: true },
  kind: { type: String, default: 'on-loan' },
})
const emit = defineEmits(['confirm', 'close'])

const { todayString } = useClock()
const note = ref('')
const until = ref('')
const status = ref(props.kind === 'on-loan' ? 'on-loan' : 'maintenance')
const texts = computed(() => props.kind === 'on-loan' ? 'vehicles.loan' : 'vehicles.outOfService')

function submit() {
  if (!note.value.trim()) return
  emit('confirm', { note: note.value.trim(), until: until.value, status: status.value })
}
</script>

<template>
  <BaseModal :title="$t(`${texts}.title`)" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-stone-600">
        {{ $t('vehicles.loan.vehicle') }} <strong class="plate">{{ vehicle.plate }}</strong> <span class="text-stone-400">{{ vehicle.name }}</span>
      </p>
      <fieldset v-if="kind !== 'on-loan'" class="flex gap-2">
        <legend class="label">{{ $t('vehicles.outOfService.reason') }}</legend>
        <label v-for="option in ['maintenance', 'broken']" :key="option"
          :class="['flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm min-h-[44px] cursor-pointer',
            status === option ? 'border-olive-500 bg-olive-50 text-olive-800 font-medium' : 'border-stone-300']">
          <input type="radio" v-model="status" :value="option" />
          {{ $t(`status.${option}`) }}
        </label>
      </fieldset>
      <div>
        <label class="label" for="loan-note">{{ $t(`${texts}.note`) }} *</label>
        <textarea id="loan-note" v-model="note" class="input" rows="3"
          :placeholder="$t(`${texts}.notePlaceholder`)" required autofocus />
      </div>
      <div>
        <label class="label" for="loan-until">{{ $t(kind === 'on-loan' ? 'vehicles.loanUntilOptional' : 'vehicles.outOfService.untilOptional') }}</label>
        <DateField id="loan-until" v-model="until" :min="todayString" />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ $t(`${texts}.confirm`) }}</button>
      </div>
    </form>
  </BaseModal>
</template>
