<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useClock } from '../stores/clock.js'
import { byCheckUrgency, checkStatus, checkHistory, CHECK_STATUS } from '../checks.js'
import { formatDateTime } from '../datetime.js'
import { personName } from '../labels.js'
import CheckModal from '../components/checks/CheckModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const { todayString } = useClock()
const router = useRouter()

onMounted(() => {
  vehiclesStore.init()
  personsStore.init()
})

const recordingVehicle = ref(null)
const deletedRecord = ref(null)
const expandedId = ref(null)

const STATUS_CLASSES = {
  [CHECK_STATUS.NEVER]: 'bg-red-100 text-red-700 border-red-200',
  [CHECK_STATUS.OK]: 'bg-green-100 text-green-700 border-green-200',
  [CHECK_STATUS.DUE]: 'bg-orange-100 text-orange-700 border-orange-200',
  [CHECK_STATUS.OVERDUE]: 'bg-red-100 text-red-700 border-red-200',
}

const rows = computed(() =>
  byCheckUrgency(vehiclesStore.vehicles, todayString.value).map(({ vehicle, days }) => ({
    vehicle,
    days,
    status: checkStatus(vehicle, todayString.value),
    history: checkHistory(vehicle),
  }))
)

const upToDate = computed(() => rows.value.filter(row => row.status === CHECK_STATUS.OK).length)
const toDo = computed(() => rows.value.length - upToDate.value)

function performerLabel(check) {
  if (check.personId) {
    const person = personsStore.persons.find(p => p.id === check.personId)
    return person ? personName(person) : '—'
  }
  return check.note || '—'
}

function formatDate(dateStr) {
  return formatDateTime(dateStr)
}

function toggleExpanded(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function onSave(data) {
  vehiclesStore.addCheck(recordingVehicle.value.id, data)
  recordingVehicle.value = null
}

function onDelete() {
  vehiclesStore.removeCheck(deletedRecord.value.vehicleId, deletedRecord.value.checkId)
  deletedRecord.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h1 class="page-title mb-0">{{ $t('checks.title') }}</h1>
      <button @click="router.push({ path: '/print', query: { doc: 'checks' } })" class="btn-secondary">
        {{ $t('printing.printChecks') }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="stat-card bg-stone-50 border border-stone-200">
        <p class="stat-value text-stone-800">{{ rows.length }}</p>
        <p class="stat-label text-stone-600">{{ $t('checks.total') }}</p>
      </div>
      <div class="stat-card stat-green">
        <p class="stat-value">{{ upToDate }}</p>
        <p class="stat-label">{{ $t('checks.upToDate') }}</p>
      </div>
      <div class="stat-card stat-red">
        <p class="stat-value">{{ toDo }}</p>
        <p class="stat-label">{{ $t('checks.toDo') }}</p>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="row in rows" :key="row.vehicle.id" class="card">
        <div class="flex items-start justify-between gap-3">
          <button class="flex-1 min-w-0 text-left" @click="toggleExpanded(row.vehicle.id)"
            :aria-expanded="expandedId === row.vehicle.id">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="plate">{{ row.vehicle.plate }}</p>
              <span class="text-xs text-stone-500">{{ row.vehicle.name }}</span>
              <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                STATUS_CLASSES[row.status]]">
                {{ $t(`checks.status.${row.status}`, { days: row.days }) }}
              </span>
            </div>
            <p v-if="row.history.length" class="text-sm text-stone-500 mt-1">
              {{ formatDate(row.history[0].date) }} · {{ performerLabel(row.history[0]) }}
            </p>
          </button>

          <button @click="recordingVehicle = row.vehicle" class="btn-primary text-sm shrink-0">
            {{ $t('checks.record') }}
          </button>
        </div>

        <div v-if="expandedId === row.vehicle.id" class="mt-3 pt-3 border-t border-stone-100">
          <p class="text-sm font-medium text-stone-700 mb-2">{{ $t('checks.history') }}</p>
          <ul v-if="row.history.length" class="space-y-1">
            <li v-for="check in row.history" :key="check.id"
              class="flex items-center justify-between text-sm text-stone-600 py-1">
              <span class="flex items-center gap-2">
                <span class="font-medium">{{ formatDate(check.date) }}</span>
                <span class="text-stone-400">·</span>
                <span>{{ performerLabel(check) }}</span>
              </span>
              <button @click="deletedRecord = { vehicleId: row.vehicle.id, checkId: check.id }"
                class="btn-action btn-action-danger">
                {{ $t('actions.delete') }}
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-stone-400 italic">{{ $t('checks.noHistory') }}</p>
        </div>
      </div>
    </div>

    <ListPlaceholder v-if="rows.length === 0"
      :loading="!vehiclesStore.loaded" :message="$t('checks.empty')" />

    <CheckModal v-if="recordingVehicle" :vehicle="recordingVehicle"
      @save="onSave" @close="recordingVehicle = null" />

    <ConfirmModal v-if="deletedRecord"
      :title="$t('checks.deleteTitle')"
      :message="$t('checks.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedRecord = null" />
  </div>
</template>
