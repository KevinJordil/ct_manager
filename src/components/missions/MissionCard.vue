<script setup>
import { computed } from 'vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { formatDT, getMissionStatut } from '../../utils.js'
import StatusBadge from '../common/StatusBadge.vue'

const props = defineProps({ mission: { type: Object, required: true } })
defineEmits(['edit', 'delete'])

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()

const statut = computed(() => getMissionStatut(props.mission))

const vehiculesDetail = computed(() =>
  (props.mission.vehicules ?? []).filter(v => v.vehiculeId).map(v => ({
    ...v,
    vehicule: vehiclesStore.vehicles.find(vv => vv.id === v.vehiculeId),
    chauffeur: v.chauffeurId ? personsStore.persons.find(p => p.id === v.chauffeurId) : null,
  }))
)

const personnelLibre = computed(() =>
  (props.mission.personnes ?? []).map(id => personsStore.persons.find(p => p.id === id)).filter(Boolean)
)
</script>

<template>
  <div class="card">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-semibold text-gray-900">{{ mission.titre }}</p>
          <StatusBadge :statut="statut" />
        </div>
        <p v-if="mission.description" class="mt-1 text-sm text-gray-500 truncate">{{ mission.description }}</p>

        <p class="mt-1.5 flex items-center gap-1 text-sm text-gray-500">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {{ formatDT(mission.dateDebut) }} → {{ formatDT(mission.dateFin) }}
        </p>

        <div v-if="vehiculesDetail.length" class="mt-2 space-y-1">
          <div v-for="v in vehiculesDetail" :key="v.id" class="flex items-center gap-1.5 text-sm text-gray-600">
            <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7 0h6m-3-3v6"/>
            </svg>
            <span class="font-medium">{{ v.vehicule?.nom ?? '—' }}</span>
            <template v-if="v.chauffeur">
              <span class="text-gray-400">·</span>
              <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <span>{{ v.chauffeur.grade ? v.chauffeur.grade + ' ' : '' }}{{ v.chauffeur.prenom }} {{ v.chauffeur.nom }}</span>
            </template>
            <span v-else class="text-xs text-gray-400 italic">sans chauffeur</span>
            <span v-if="v.avecRemorque" class="text-xs bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-medium">+ remorque</span>
          </div>
        </div>

        <div v-if="personnelLibre.length" class="mt-1.5 flex flex-wrap gap-1.5">
          <span v-for="p in personnelLibre" :key="p.id"
            class="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            {{ p.grade ? p.grade + ' ' : '' }}{{ p.prenom }} {{ p.nom }}
          </span>
        </div>

        <p v-if="mission.notes" class="mt-1.5 text-sm text-gray-400 italic">{{ mission.notes }}</p>
      </div>

      <div class="flex gap-1 shrink-0">
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
