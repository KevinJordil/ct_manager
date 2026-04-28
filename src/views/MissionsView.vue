<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { getMissionStatut } from '../utils.js'
import MissionCard from '../components/missions/MissionCard.vue'
import MissionForm from '../components/missions/MissionForm.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const store = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()

onMounted(() => {
  store.init()
  vehiclesStore.init()
  personsStore.init()
})

const showForm = ref(false)
const editingMission = ref(null)
const deletingId = ref(null)
const filtreStatut = ref('all')

const STATUTS = ['all', 'planifiée', 'en cours', 'terminée']
const STATUT_LABELS = { all: 'Toutes', planifiée: 'Planifiées', 'en cours': 'En cours', terminée: 'Terminées' }

const missionsFiltrees = computed(() =>
  filtreStatut.value === 'all'
    ? store.missions
    : store.missions.filter(m => getMissionStatut(m) === filtreStatut.value)
)

function countByStatut(s) {
  return store.missions.filter(m => getMissionStatut(m) === s).length
}

function openCreate() { editingMission.value = null; showForm.value = true }
function openEdit(mission) { editingMission.value = mission; showForm.value = true }

function onSave(data) {
  if (editingMission.value) {
    store.update(editingMission.value.id, data)
  } else {
    store.add(data)
  }
  showForm.value = false
}

function confirmDelete(id) { deletingId.value = id }

function onDelete() {
  store.remove(deletingId.value)
  deletingId.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">Missions</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Ajouter
      </button>
    </div>

    <div class="flex gap-2 mb-6 flex-wrap">
      <button v-for="s in STATUTS" :key="s" @click="filtreStatut = s"
        :class="['px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
          filtreStatut === s ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300']">
        {{ STATUT_LABELS[s] }}
        <span class="ml-1 text-xs opacity-70">
          ({{ s === 'all' ? store.missions.length : countByStatut(s) }})
        </span>
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <MissionCard
        v-for="mission in missionsFiltrees"
        :key="mission.id"
        :mission="mission"
        @edit="openEdit(mission)"
        @delete="confirmDelete(mission.id)"
      />
    </TransitionGroup>

    <p v-if="missionsFiltrees.length === 0" class="text-gray-400 text-sm italic">Aucune mission</p>

    <MissionForm v-if="showForm" :mission="editingMission" @save="onSave" @close="showForm = false" />

    <ConfirmModal
      v-if="deletingId"
      message="Êtes-vous sûr de vouloir supprimer cette mission ?"
      @confirm="onDelete"
      @cancel="deletingId = null"
    />
  </div>
</template>
