<script setup>
/**
 * Message shown in place of a list: still loading, or empty.
 * Without the first case, "no records" appears while the request is still in
 * flight, suggesting the data has vanished.
 */
defineProps({
  loading: { type: Boolean, default: false },
  message: { type: String, required: true },
})
</script>

<template>
  <p v-if="loading" class="flex items-center gap-2 text-gray-400 text-sm" role="status" aria-live="polite">
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    {{ $t('common.loading') }}
  </p>
  <p v-else class="text-gray-400 text-sm italic">{{ message }}</p>
</template>
