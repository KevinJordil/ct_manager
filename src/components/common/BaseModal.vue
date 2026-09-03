<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { newId } from '../../id.js'

defineProps({ title: String })
const emit = defineEmits(['close'])

const panel = ref(null)
const titleId = `modal-title-${newId()}`
let previousFocus = null

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements() {
  if (!panel.value) return []
  return [...panel.value.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(el => el.offsetParent !== null)
}

/** Keeps focus inside the dialog (Tab / Shift+Tab) */
function trapFocus(event) {
  const focusables = focusableElements()
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event) {
  if (event.key === 'Escape') { event.stopPropagation(); emit('close') }
  else if (event.key === 'Tab') trapFocus(event)
}

onMounted(async () => {
  previousFocus = document.activeElement
  document.addEventListener('keydown', onKeydown)
  // Stops the page behind the dialog from scrolling.
  document.body.style.overflow = 'hidden'
  await nextTick()
  const [first] = focusableElements()
  ;(first ?? panel.value)?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  previousFocus?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')" />
        <div ref="panel" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1"
          class="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col focus:outline-none">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 :id="titleId" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
            <button type="button" @click="$emit('close')" :aria-label="$t('actions.close')"
              class="inline-flex items-center justify-center min-w-[36px] min-h-[36px] -mr-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="overflow-y-auto flex-1 px-6 py-4">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
