<script setup>
import BaseModal from './BaseModal.vue'

defineProps({
  title: { type: String, default: '' },
  message: { type: String, required: true },
  /** Overrides the plain "Confirmer", when naming the act reads better. */
  confirmLabel: { type: String, default: '' },
  /**
   * A deletion is asked in red; an ordinary act — hanging up a key, ending a
   * loan — is asked in the accent colour. Red everywhere would stop meaning
   * anything.
   */
  tone: { type: String, default: 'danger' },
})
defineEmits(['confirm', 'cancel'])
</script>

<template>
  <BaseModal :title="title || $t('actions.confirmation')" @close="$emit('cancel')">
    <p class="text-stone-600 mb-6">{{ message }}</p>
    <div class="flex justify-end gap-3">
      <button @click="$emit('cancel')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
      <button @click="$emit('confirm')" :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'">
        {{ confirmLabel || $t('actions.confirm') }}
      </button>
    </div>
  </BaseModal>
</template>
