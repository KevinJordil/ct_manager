<script setup>
import { reactive, computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { formatDT } from '../../utils.js'

const props = defineProps({ person: { type: Object, required: true } })
defineEmits(['close'])

const store = usePersonsStore()
const form = reactive({ dateDebut: '', dateFin: '' })

const erreur = computed(() => {
  if (!form.dateDebut || !form.dateFin) return null
  return form.dateFin < form.dateDebut ? 'La fin doit être après le début' : null
})

function addConge() {
  if (!form.dateDebut || !form.dateFin || erreur.value) return
  store.addConge(props.person.id, { dateDebut: form.dateDebut, dateFin: form.dateFin })
  form.dateDebut = ''; form.dateFin = ''
}

function removeConge(id) { store.removeConge(props.person.id, id) }

const now = new Date().toISOString().slice(0, 16)

function congeStatus(c) {
  if (c.dateFin < now) return 'passé'
  if (c.dateDebut <= now && now <= c.dateFin) return 'actuel'
  return 'futur'
}

const STATUS_CLASSES = {
  actuel: 'bg-red-50 border-red-200 text-red-700',
  futur: 'bg-orange-50 border-orange-200 text-orange-700',
  passé: 'bg-gray-50 border-gray-200 text-gray-500',
}
const STATUS_LABELS = { actuel: 'En cours', futur: 'À venir', passé: 'Passé' }

const congesTries = computed(() =>
  [...(props.person.conges ?? [])].sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))
)
</script>

<template>
  <BaseModal :title="`Congés — ${person.prenom} ${person.nom}`" @close="$emit('close')">
    <div class="space-y-5">

      <div>
        <p class="text-sm font-medium text-gray-700 mb-2">Périodes enregistrées</p>
        <div v-if="congesTries.length" class="space-y-2">
          <div v-for="c in congesTries" :key="c.id"
            :class="['flex items-center justify-between p-2.5 border rounded-lg text-sm', STATUS_CLASSES[congeStatus(c)]]">
            <div class="flex items-center gap-2 flex-wrap">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="font-medium">{{ formatDT(c.dateDebut) }}</span>
              <span class="opacity-60">→</span>
              <span class="font-medium">{{ formatDT(c.dateFin) }}</span>
              <span class="text-xs opacity-60">({{ STATUS_LABELS[congeStatus(c)] }})</span>
            </div>
            <button @click="removeConge(c.id)" class="hover:opacity-70 transition-opacity ml-2 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 italic">Aucun congé enregistré</p>
      </div>

      <div class="border-t border-gray-100 pt-4">
        <p class="text-sm font-medium text-gray-700 mb-3">Ajouter une période</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Début</label>
            <input v-model="form.dateDebut" type="datetime-local" class="input" />
          </div>
          <div>
            <label class="label">Fin</label>
            <input v-model="form.dateFin" type="datetime-local" class="input" :min="form.dateDebut" />
          </div>
        </div>
        <p v-if="erreur" class="mt-1.5 text-xs text-red-600">{{ erreur }}</p>
        <button @click="addConge"
          :disabled="!form.dateDebut || !form.dateFin || !!erreur"
          class="mt-3 w-full justify-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          Ajouter le congé
        </button>
      </div>

      <div class="flex justify-end pt-1">
        <button @click="$emit('close')" class="btn-secondary">Fermer</button>
      </div>
    </div>
  </BaseModal>
</template>
