<script setup>
import { ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps({ vehicle: { type: Object, required: true } })
const emit = defineEmits(['confirm', 'close'])

const note = ref('')

function submit() {
  if (!note.value.trim()) return
  emit('confirm', note.value.trim())
}
</script>

<template>
  <BaseModal :title="$t('vehicles.loan.title')" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-gray-600">
        {{ $t('vehicles.loan.vehicle') }} <strong>{{ vehicle.name }}</strong>
      </p>
      <div>
        <label class="label" for="loan-note">{{ $t('vehicles.loan.note') }} *</label>
        <textarea id="loan-note" v-model="note" class="input" rows="3"
          :placeholder="$t('vehicles.loan.notePlaceholder')" required autofocus />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ $t('vehicles.loan.confirm') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
