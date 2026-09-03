<script setup>
/** Search box shared by the list views. */
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="relative">
    <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
    <input
      type="search"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      :placeholder="placeholder || $t('common.search')"
      :aria-label="placeholder || $t('common.search')"
      class="input pl-9 pr-9" />
    <button v-if="modelValue" type="button" @click="$emit('update:modelValue', '')"
      :aria-label="$t('common.clearSearch')"
      class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[28px] min-h-[28px] text-gray-400 hover:text-gray-700 rounded">
      ✕
    </button>
  </div>
</template>
