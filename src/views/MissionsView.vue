<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useClock } from '../stores/clock.js'
import { getMissionStatus } from '../availability.js'
import { MISSION_STATUS } from '../constants.js'
import MissionCard from '../components/missions/MissionCard.vue'
import MissionForm from '../components/missions/MissionForm.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const store = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const { nowString } = useClock()

onMounted(() => {
  store.init()
  vehiclesStore.init()
  personsStore.init()
})

const showForm = ref(false)
const editedMission = ref(null)
const deletedId = ref(null)
const statusFilter = ref('all')

const FILTERS = ['all', MISSION_STATUS.PLANNED, MISSION_STATUS.ONGOING, MISSION_STATUS.COMPLETED]

const counts = computed(() => {
  const totals = { all: store.missions.length, planned: 0, ongoing: 0, completed: 0 }
  for (const mission of store.missions) totals[getMissionStatus(mission, nowString.value)]++
  return totals
})

const filteredMissions = computed(() =>
  statusFilter.value === 'all'
    ? store.missions
    : store.missions.filter(m => getMissionStatus(m, nowString.value) === statusFilter.value)
)

function openCreate() {
  editedMission.value = null
  showForm.value = true
}

function openEdit(mission) {
  editedMission.value = mission
  showForm.value = true
}

function onSave(data) {
  if (editedMission.value) store.update(editedMission.value.id, data)
  else store.add(data)
  showForm.value = false
}

function onDelete() {
  store.remove(deletedId.value)
  deletedId.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('missions.title') }}</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <div class="flex gap-2 mb-6 flex-wrap">
      <button v-for="filter in FILTERS" :key="filter" @click="statusFilter = filter"
        :aria-pressed="statusFilter === filter"
        :class="['px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
          statusFilter === filter ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300']">
        {{ $t(`missions.filters.${filter}`) }}
        <span class="ml-1 text-xs opacity-70">({{ counts[filter] }})</span>
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <MissionCard
        v-for="mission in filteredMissions"
        :key="mission.id"
        :mission="mission"
        @edit="openEdit(mission)"
        @delete="deletedId = mission.id"
      />
    </TransitionGroup>

    <ListPlaceholder v-if="filteredMissions.length === 0"
      :loading="!store.loaded" :message="$t('missions.empty')" />

    <MissionForm v-if="showForm" :mission="editedMission" @save="onSave" @close="showForm = false" />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('missions.deleteTitle')"
      :message="$t('missions.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
