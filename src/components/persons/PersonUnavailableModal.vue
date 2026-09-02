<script setup>
import { ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { personName } from '../../labels.js'

const props = defineProps({ person: { type: Object, required: true } })
const emit = defineEmits(['confirm', 'close'])

const note = ref('')

function submit() {
  if (!note.value.trim()) return
  emit('confirm', note.value.trim())
}
</script>

<template>
  <BaseModal :title="$t('persons.unavailability.title', { name: personName(person) })" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-gray-600">
        {{ $t('persons.unavailability.person') }} <strong>{{ personName(person) }}</strong>
      </p>
      <div>
        <label class="label" for="unavailability-reason">{{ $t('persons.unavailability.reason') }} *</label>
        <textarea id="unavailability-reason" v-model="note" class="input" rows="3"
          :placeholder="$t('persons.unavailability.placeholder')" required autofocus />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ $t('actions.confirm') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
