<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionsStore } from '../../stores/missions.js'
import { useClock } from '../../stores/clock.js'
import { getVehiculeStatut, missionActuelleDeVehicule } from '../../availability.js'
import StatusBadge from '../common/StatusBadge.vue'

const props = defineProps({ vehicle: { type: Object, required: true } })
defineEmits(['edit', 'delete', 'pret', 'liberer'])

const router = useRouter()
const missionsStore = useMissionsStore()
const { nowStr } = useClock()

const missionEnCours = computed(() =>
  missionActuelleDeVehicule(props.vehicle.id, missionsStore.missions, nowStr.value)
)

const effectiveStatut = computed(() =>
  getVehiculeStatut(props.vehicle, missionsStore.missions, nowStr.value)
)

const CATEGORIE_LABELS = {
  'léger-route': 'Léger (route)',
  'léger-tt': 'Léger (TT)',
  'moyen': 'Moyen ≤ 7.5t',
  'lourd': 'Lourd',
}
</script>

<template>
  <div class="card">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-semibold text-gray-900">{{ vehicle.nom }}</p>
          <span class="text-xs text-gray-500 font-mono">{{ vehicle.immatriculation }}</span>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1 items-center">
          <StatusBadge :statut="effectiveStatut" />
          <span class="badge-gray">{{ CATEGORIE_LABELS[vehicle.categorie] }}</span>
          <span v-if="vehicle.places" class="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            {{ vehicle.places }} places
          </span>
        </div>

        <div v-if="effectiveStatut === 'en mission' && missionEnCours" class="mt-2">
          <button @click="router.push('/missions')" class="text-sm text-orange-600 hover:text-orange-800 underline underline-offset-2">
            {{ missionEnCours.titre }}
          </button>
        </div>

        <div v-if="vehicle.statut === 'en prêt' && vehicle.commentairePret" class="mt-2 text-sm text-red-600 italic">
          {{ vehicle.commentairePret }}
        </div>
      </div>

      <div class="flex gap-1 shrink-0">
        <template v-if="effectiveStatut === 'libre'">
          <button @click="$emit('pret')" class="icon-btn" title="Mettre en prêt" aria-label="Mettre en prêt">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>
          </button>
        </template>
        <template v-if="vehicle.statut === 'en prêt'">
          <button @click="$emit('liberer')" class="icon-btn text-green-600 hover:text-green-800" title="Libérer" aria-label="Libérer le véhicule">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </button>
        </template>
        <button @click="$emit('edit')" aria-label="Modifier le véhicule" title="Modifier" class="icon-btn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button @click="$emit('delete')" aria-label="Supprimer le véhicule" title="Supprimer" class="icon-btn text-red-400 hover:text-red-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
