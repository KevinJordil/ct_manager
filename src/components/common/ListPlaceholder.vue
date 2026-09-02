<script setup>
/**
 * Message affiché à la place d'une liste : chargement en cours, ou liste vide.
 * Sans le premier cas, « Aucun élément » s'affiche pendant que la requête est
 * encore en vol, ce qui laisse croire que les données ont disparu.
 */
defineProps({
  chargement: { type: Boolean, default: false },
  message: { type: String, required: true },
})
</script>

<template>
  <p v-if="chargement" class="flex items-center gap-2 text-gray-400 text-sm" role="status" aria-live="polite">
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    Chargement…
  </p>
  <p v-else class="text-gray-400 text-sm italic">{{ message }}</p>
</template>
