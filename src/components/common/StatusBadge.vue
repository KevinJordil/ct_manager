<script setup>
const props = defineProps({
  statut: { type: String, required: true },
  type: { type: String, default: 'default' },
})

const COLOR_MAP = {
  disponible: 'bg-green-100 text-green-800',
  libre: 'bg-green-100 text-green-800',
  terminée: 'bg-green-100 text-green-800',
  'en mission': 'bg-orange-100 text-orange-800',
  'en cours': 'bg-orange-100 text-orange-800',
  'en prêt': 'bg-red-100 text-red-800',
  'en congé': 'bg-red-100 text-red-800',
  planifiée: 'bg-blue-100 text-blue-800',
  indisponible: 'bg-yellow-100 text-yellow-800',
}

const colorClass = COLOR_MAP[props.statut] ?? 'bg-gray-100 text-gray-800'
</script>

<template>
  <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colorClass]">
    {{ statut }}
  </span>
</template>
