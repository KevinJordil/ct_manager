<script setup>
import { computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { formatDateTime } from '../../datetime.js'

const props = defineProps({ vehicle: { type: Object, required: true } })
defineEmits(['close'])

/**
 * Most recent movement first. Who held the key and who recorded the movement
 * are two different questions — anybody may hand a key over for somebody
 * else — so the second name is shown whenever it differs from the first.
 */
const entries = computed(() =>
  [...(props.vehicle.keyHistory ?? [])].reverse().map(entry => ({
    ...entry,
    byOther: Boolean(entry.recordedBy) && entry.recordedBy !== entry.name,
  }))
)

const DOT = {
  taken: 'bg-amber-500',
  transferred: 'bg-blue-500',
  returned: 'bg-green-500',
}
</script>

<template>
  <BaseModal :title="$t('keys.historyTitle', { vehicle: vehicle.name })" @close="$emit('close')">
    <ol v-if="entries.length" class="space-y-3 max-h-80 overflow-y-auto">
      <li v-for="entry in entries" :key="entry.id" class="flex gap-3 text-sm">
        <span :class="['mt-1.5 w-2 h-2 rounded-full shrink-0', DOT[entry.action] ?? 'bg-gray-400']" />
        <div class="min-w-0">
          <p class="text-gray-800">
            <template v-if="entry.action === 'returned'">
              {{ $t('keys.log.returned', { name: entry.name }) }}
            </template>
            <template v-else-if="entry.action === 'transferred'">
              {{ $t('keys.log.transferred', { from: entry.from, name: entry.name }) }}
            </template>
            <template v-else>
              {{ $t('keys.log.taken', { name: entry.name }) }}
            </template>
          </p>
          <p class="text-xs text-gray-400">
            {{ formatDateTime(entry.at) }}
            <span v-if="entry.byOther"> · {{ $t('keys.recordedBy', { user: entry.recordedBy }) }}</span>
          </p>
        </div>
      </li>
    </ol>
    <p v-else class="text-sm text-gray-500 italic">{{ $t('keys.noHistory') }}</p>

    <div class="flex justify-end pt-4">
      <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.close') }}</button>
    </div>
  </BaseModal>
</template>
