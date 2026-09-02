<script setup>
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale } from '../../i18n/index.js'

const { locale } = useI18n()
</script>

<template>
  <div class="flex shrink-0 rounded-lg overflow-hidden border border-gray-700" role="group" :aria-label="$t('app.language')">
    <button
      v-for="option in SUPPORTED_LOCALES"
      :key="option.code"
      type="button"
      @click="setLocale(option.code)"
      :aria-pressed="locale === option.code"
      :title="option.label"
      :class="['px-2 py-1 text-xs font-semibold uppercase transition-colors',
        locale === option.code ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800']">
      {{ option.code }}
    </button>
  </div>
</template>
