<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../common/StatusBadge.vue'
import { getStatut } from '../../stores/persons.js'
import { useMissionsStore } from '../../stores/missions.js'
import { formatDT, getMissionStatut } from '../../utils.js'

const props = defineProps({ person: { type: Object, required: true } })
defineEmits(['edit', 'delete', 'manage-conges', 'toggle-indisponible'])

const router = useRouter()
const missionsStore = useMissionsStore()

const PERMIS_COLORS = {
  '920':  'bg-sky-100 text-sky-700',
  '920E': 'bg-sky-200 text-sky-800',
  '921':  'bg-teal-100 text-teal-700',
  '921E': 'bg-teal-200 text-teal-800',
  '930':  'bg-violet-100 text-violet-700',
  '930E': 'bg-violet-200 text-violet-800',
  '931':  'bg-orange-100 text-orange-700',
  '931E': 'bg-orange-200 text-orange-800',
}

const missionEnCours = computed(() =>
  missionsStore.missions.find(m => {
    if (getMissionStatut(m) !== 'en cours') return false
    return m.vehicules?.some(v => v.chauffeurId === props.person.id) || m.personnes?.includes(props.person.id)
  })
)

const statut = computed(() => {
  const base = getStatut(props.person)
  if (base !== 'disponible') return base
  return missionEnCours.value ? 'en mission' : 'disponible'
})

const now = new Date().toISOString().slice(0, 16)
const congesActifs = computed(() =>
  (props.person.conges ?? []).filter(c => c.dateFin >= now)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
)
</script>

<template>
  <div class="card">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-900">
          <span v-if="person.grade" class="text-gray-500 font-normal text-sm mr-1">{{ person.grade }}</span>
          {{ person.prenom }} {{ person.nom }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <StatusBadge :statut="statut" />
          <span v-for="p in person.permis" :key="p"
            :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', PERMIS_COLORS[p] ?? 'bg-gray-100 text-gray-700']">
            {{ p }}
          </span>
        </div>

        <div v-if="missionEnCours" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2">
            {{ missionEnCours.titre }}
          </button>
        </div>

        <div v-if="person.indisponible && person.commentaireIndisponible"
          class="mt-2 inline-flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          {{ person.commentaireIndisponible }}
        </div>

        <div v-if="congesActifs.length" class="mt-2 flex flex-col gap-1">
          <div v-for="c in congesActifs" :key="c.id"
            class="inline-flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 w-fit">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ formatDT(c.dateDebut) }} → {{ formatDT(c.dateFin) }}
          </div>
        </div>

        <p v-if="person.notes" class="mt-2 text-sm text-gray-500 italic">{{ person.notes }}</p>
      </div>

      <div class="flex gap-1 shrink-0">
        <button @click="$emit('toggle-indisponible')"
          :class="['icon-btn', person.indisponible ? 'text-yellow-500 hover:text-yellow-700' : '']"
          :title="person.indisponible ? 'Lever l\'indisponibilité' : 'Marquer indisponible'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
          </svg>
        </button>
        <button @click="$emit('manage-conges')" class="icon-btn" title="Gérer les congés">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </button>
        <button @click="$emit('edit')" class="icon-btn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button @click="$emit('delete')" class="icon-btn text-red-400 hover:text-red-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
