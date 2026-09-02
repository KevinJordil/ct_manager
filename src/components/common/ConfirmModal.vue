<script setup>
import BaseModal from './BaseModal.vue'

defineProps({
  title: { type: String, default: '' },
  message: { type: String, required: true },
})
defineEmits(['confirm', 'cancel'])
</script>

<template>
  <BaseModal :title="title || $t('actions.confirmation')" @close="$emit('cancel')">
    <p class="text-gray-600 mb-6">{{ message }}</p>
    <div class="flex justify-end gap-3">
      <button @click="$emit('cancel')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
      <button @click="$emit('confirm')" class="btn-danger">{{ $t('actions.confirm') }}</button>
    </div>
  </BaseModal>
</template>
