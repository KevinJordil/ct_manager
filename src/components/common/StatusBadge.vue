<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true },
})

const COLOR_BY_STATUS = {
  available: 'bg-green-100 text-green-800',
  free: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  'on-mission': 'bg-orange-100 text-orange-800',
  ongoing: 'bg-orange-100 text-orange-800',
  'on-loan': 'bg-red-100 text-red-800',
  'on-leave': 'bg-red-100 text-red-800',
  planned: 'bg-sky-100 text-sky-800',
  unavailable: 'bg-amber-100 text-amber-800',
}

// Computed, not a constant: a mission's status changes over time without the
// component being recreated.
const colorClass = computed(() => COLOR_BY_STATUS[props.status] ?? 'bg-stone-100 text-stone-800')
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide', colorClass]">
    {{ $t(`status.${status}`) }}
  </span>
</template>
