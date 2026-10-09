<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useClock } from '../stores/clock.js'
import { useAuthStore } from '../stores/auth.js'
import { getMissionStatus } from '../availability.js'
import { MISSION_STATUS } from '../constants.js'
import MissionCard from '../components/missions/MissionCard.vue'
import MissionForm from '../components/missions/MissionForm.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'
import { filterBySearch } from '../search.js'
import { personName } from '../labels.js'
import { vehicleInMission, personInMission } from '../retired.js'

const store = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const auth = useAuthStore()
const { nowString } = useClock()
const router = useRouter()

function printList() {
  router.push({ path: '/print', query: { doc: 'missions', status: statusFilter.value } })
}

function printMission(mission) {
  router.push({ path: '/print', query: { doc: 'mission', id: mission.id } })
}

onMounted(() => {
  store.init()
  vehiclesStore.init()
  personsStore.init()
})

const showForm = ref(false)
const editedMission = ref(null)
const deletedId = ref(null)
const cancelledId = ref(null)
const cancelling = ref(false)
async function cancelMission() {
  if (cancelling.value) return
  cancelling.value = true
  try { if (await store.update(cancelledId.value, { cancelled: true })) cancelledId.value = null }
  finally { cancelling.value = false }
}
/** A cancelled mission can be taken up again; its resources count as engaged once more. */
const reopenedId = ref(null)
async function reopenMission() {
  if (await store.update(reopenedId.value, { cancelled: false })) reopenedId.value = null
}

/** Confirmations name the mission at stake, so a misplaced click reads as such. */
const titleOf = id => store.missions.find(mission => mission.id === id)?.title ?? ''

const statusFilter = ref('all')

const FILTERS = ['all', MISSION_STATUS.PLANNED, MISSION_STATUS.ONGOING, MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED]

const counts = computed(() => {
  const totals = { all: store.missions.length, planned: 0, ongoing: 0, completed: 0, cancelled: 0 }
  for (const mission of store.missions) totals[getMissionStatus(mission, nowString.value)]++
  return totals
})

const search = ref('')

/** Searching a mission also reaches the people and vehicles it engages. */
function searchableFields(mission) {
  const people = [
    ...(mission.vehicles ?? []).map(entry => entry.driverId),
    ...(mission.staffIds ?? []),
  ].map(id => personName(personInMission(mission, id, personsStore.persons)))

  const vehicles = (mission.vehicles ?? [])
    .map(entry => vehicleInMission(mission, entry.vehicleId, vehiclesStore.vehicles))
    .filter(Boolean)
    .flatMap(vehicle => [vehicle.name, vehicle.plate])

  return [mission.title, mission.description, mission.notes, people, vehicles]
}

const filteredMissions = computed(() => {
  const byStatus = statusFilter.value === 'all'
    ? store.missions
    : store.missions.filter(m => getMissionStatus(m, nowString.value) === statusFilter.value)
  return sortForPlanning(filterBySearch(byStatus, search.value, searchableFields))
})

/**
 * What still lies ahead first, the soonest on top; then what is over or
 * cancelled, the most recent on top. Insertion order answers nothing.
 */
function sortForPlanning(missions) {
  const now = nowString.value
  const ahead = mission => {
    const status = getMissionStatus(mission, now)
    return status === MISSION_STATUS.ONGOING || status === MISSION_STATUS.PLANNED
  }
  return [...missions].sort((a, b) => {
    if (ahead(a) !== ahead(b)) return ahead(a) ? -1 : 1
    const order = (a.startDate ?? '').localeCompare(b.startDate ?? '')
    return ahead(a) ? order : -order
  })
}

function openCreate() {
  editedMission.value = null
  showForm.value = true
}

function openEdit(mission) {
  editedMission.value = mission
  showForm.value = true
}

/** The form stays open until the server has the mission: a refusal keeps what was typed. */
async function onSave(data) {
  const saved = editedMission.value
    ? await store.update(editedMission.value.id, data)
    : Boolean(await store.add(data))
  if (saved) showForm.value = false
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
      <div class="flex gap-2">
        <button @click="printList" class="btn-secondary">{{ $t('printing.printList') }}</button>
        <button v-if="auth.can('missions.manage')" @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
          {{ $t('actions.add') }}
        </button>
      </div>
    </div>

    <div class="flex gap-2 mb-6 flex-wrap">
      <button v-for="filter in FILTERS" :key="filter" @click="statusFilter = filter"
        :aria-pressed="statusFilter === filter"
        :class="['px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
          statusFilter === filter ? 'bg-olive-600 border-olive-600 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-olive-300']">
        {{ $t(`missions.filters.${filter}`) }}
        <span class="ml-1 text-xs opacity-70">({{ counts[filter] }})</span>
      </button>
    </div>

    <SearchField v-model="search" class="mb-4 max-w-md" />

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <MissionCard
        v-for="mission in filteredMissions"
        :key="mission.id"
        :mission="mission"
        @edit="openEdit(mission)"
        @delete="deletedId = mission.id"
        @cancel="cancelledId = mission.id"
        @reopen="reopenedId = mission.id"
        :can-manage="auth.can('missions.manage')"
        @print="printMission(mission)"
      />
    </TransitionGroup>

    <ListPlaceholder v-if="filteredMissions.length === 0"
      :loading="!store.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('missions.empty')" />

    <MissionForm v-if="showForm" :mission="editedMission" @save="onSave" @close="showForm = false" />

    <ConfirmModal v-if="cancelledId" :title="$t('missions.cancelMission')"
      :message="$t('missions.cancelConfirm', { title: titleOf(cancelledId) })"
      :confirm-label="$t('missions.cancelMission')" :cancel-label="$t('missions.keepMission')"
      :disabled="cancelling" @confirm="cancelMission" @cancel="cancelledId = null" />
    <ConfirmModal v-if="reopenedId" :title="$t('missions.reopen')"
      :message="$t('missions.reopenConfirm', { title: titleOf(reopenedId) })"
      :confirm-label="$t('missions.reopen')" tone="primary"
      @confirm="reopenMission" @cancel="reopenedId = null" />
    <ConfirmModal
      v-if="deletedId"
      :title="$t('missions.deleteTitle')"
      :message="$t('missions.deleteConfirm', { title: titleOf(deletedId) })"
      :confirm-label="$t('missions.deleteTitle')"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
