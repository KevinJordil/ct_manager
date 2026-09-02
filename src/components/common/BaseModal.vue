<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { newId } from '../../id.js'

defineProps({ title: String })
const emit = defineEmits(['close'])

const panneau = ref(null)
const titreId = `modal-titre-${newId()}`
let focusPrecedent = null

const SELECTEUR_FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

function elementsFocusables() {
  if (!panneau.value) return []
  return [...panneau.value.querySelectorAll(SELECTEUR_FOCUSABLE)]
    .filter(el => el.offsetParent !== null)
}

/** Garde le focus à l'intérieur de la boîte de dialogue (Tab / Maj+Tab) */
function piegerFocus(e) {
  const focusables = elementsFocusables()
  if (!focusables.length) return
  const premier = focusables[0]
  const dernier = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault()
    dernier.focus()
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault()
    premier.focus()
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
  else if (e.key === 'Tab') piegerFocus(e)
}

onMounted(async () => {
  focusPrecedent = document.activeElement
  document.addEventListener('keydown', onKeydown)
  // Empêche la page en arrière-plan de défiler sous la modale.
  document.body.style.overflow = 'hidden'
  await nextTick()
  const [premier] = elementsFocusables()
  ;(premier ?? panneau.value)?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  focusPrecedent?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')" />
        <div ref="panneau" role="dialog" aria-modal="true" :aria-labelledby="titreId" tabindex="-1"
          class="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col focus:outline-none">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 :id="titreId" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
            <button type="button" @click="$emit('close')" aria-label="Fermer"
              class="text-gray-400 hover:text-gray-600 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
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
