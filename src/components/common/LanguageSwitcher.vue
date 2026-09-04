<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale } from '../../i18n/index.js'

const props = defineProps({
  /** 'dark' suits the sidebar, 'light' a white background */
  variant: { type: String, default: 'dark' },
})

const { locale } = useI18n()

const styles = computed(() => props.variant === 'light'
  ? {
      frame: 'border-stone-300',
      active: 'bg-olive-600 text-white',
      idle: 'text-stone-500 hover:text-stone-900 hover:bg-stone-100',
    }
  : {
      frame: 'border-stone-700',
      active: 'bg-olive-600 text-white',
      idle: 'text-stone-400 hover:text-white hover:bg-stone-800',
    })
</script>

<template>
  <div :class="['flex shrink-0 rounded-lg overflow-hidden border', styles.frame]"
    role="group" :aria-label="$t('app.language')">
    <button
      v-for="option in SUPPORTED_LOCALES"
      :key="option.code"
      type="button"
      @click="setLocale(option.code)"
      :aria-pressed="locale === option.code"
      :title="option.label"
      :class="['px-3 min-h-[36px] flex items-center text-xs font-semibold uppercase leading-none transition-colors',
        locale === option.code ? styles.active : styles.idle]">
      {{ option.code }}
    </button>
  </div>
</template>
