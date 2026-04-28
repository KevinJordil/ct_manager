<script setup>
import BaseModal from './BaseModal.vue'

defineProps({
  title: { type: String, default: 'Confirmation' },
  message: { type: String, required: true },
})
defineEmits(['confirm', 'cancel'])
</script>

<template>
  <BaseModal :title="title" @close="$emit('cancel')">
    <p class="text-gray-600 mb-6">{{ message }}</p>
    <div class="flex justify-end gap-3">
      <button @click="$emit('cancel')" class="btn-secondary">Annuler</button>
      <button @click="$emit('confirm')" class="btn-danger">Confirmer</button>
    </div>
  </BaseModal>
</template>
