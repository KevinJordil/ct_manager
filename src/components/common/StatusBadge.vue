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
  planned: 'bg-blue-100 text-blue-800',
  unavailable: 'bg-yellow-100 text-yellow-800',
}

// Computed, not a constant: a mission's status changes over time without the
// component being recreated.
const colorClass = computed(() => COLOR_BY_STATUS[props.status] ?? 'bg-gray-100 text-gray-800')
</script>

<template>
  <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colorClass]">
    {{ $t(`status.${status}`) }}
  </span>
</template>
