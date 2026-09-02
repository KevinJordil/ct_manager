<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRequestsStore } from '../stores/requests.js'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { REQUEST_STATUS, REQUEST_STATUSES } from '../constants.js'
import { formatDateTime } from '../datetime.js'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import MissionForm from '../components/missions/MissionForm.vue'

const store = useRequestsStore()
const missionsStore = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const { t } = useI18n()

onMounted(() => {
  store.init()
  missionsStore.init()
  vehiclesStore.init()
  personsStore.init()
})

const statusFilter = ref('all')
const expandedId = ref(null)
const deletedId = ref(null)
const missionPrefill = ref(null)
const approvedRequestId = ref(null)

const FILTERS = ['all', ...REQUEST_STATUSES]

const STATUS_CLASSES = {
  [REQUEST_STATUS.PENDING]: 'bg-amber-100 text-amber-800 border-amber-200',
  [REQUEST_STATUS.APPROVED]: 'bg-green-100 text-green-700 border-green-200',
  [REQUEST_STATUS.REJECTED]: 'bg-red-100 text-red-700 border-red-200',
}

const counts = computed(() => {
  const totals = { all: store.requests.length, pending: 0, approved: 0, rejected: 0 }
  for (const request of store.requests) totals[request.status]++
  return totals
})

/** Newest first: a queue is read from the most recent entry. */
const visibleRequests = computed(() => {
  const sorted = [...store.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return statusFilter.value === 'all'
    ? sorted
    : sorted.filter(request => request.status === statusFilter.value)
})

function toggleExpanded(id) {
  expandedId.value = expandedId.value === id ? null : id
}

/**
 * Turns a request into a pre-filled mission: the manager only has to pick the
 * actual vehicles and drivers, everything the requester said is carried over.
 */
function missionFromRequest(request) {
  const { contact } = request
  const section = contact.section ? ` / ${contact.section}` : ''
  const vehicleLines = request.vehicles.map((entry, index) => {
    const label = t(`requests.types.${entry.type}`)
    const driver = entry.driverRequired ? ` · ${t('requests.driverRequired')}` : ''
    return `${t('requests.vehicleNumber', { number: index + 1 })} : ${label}${driver}`
  })
  const notes = [`${t('requests.meetingPoint')} : ${request.meetingPoint}`, ...vehicleLines]
  if (request.comment) notes.push(request.comment)

  return {
    title: `${contact.company}${section}`,
    description: `${contact.firstName} ${contact.lastName} — ${contact.phone}`,
    startDate: request.startDate,
    endDate: request.endDate,
    notes: notes.join('\n'),
    vehicles: request.vehicles.map(() => ({ vehicleId: '', driverId: null, withTrailer: false })),
    staffIds: [],
  }
}

function openApproval(request) {
  missionPrefill.value = missionFromRequest(request)
  approvedRequestId.value = request.id
}

function closeApproval() {
  missionPrefill.value = null
  approvedRequestId.value = null
}

/** The request is only approved once the mission has actually been created. */
async function onMissionSave(data) {
  missionsStore.add(data)
  await store.setStatus(approvedRequestId.value, REQUEST_STATUS.APPROVED)
  closeApproval()
}

async function onDelete() {
  await store.remove(deletedId.value)
  deletedId.value = null
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('requests.title') }}</h1>

    <div class="flex gap-2 mb-6 flex-wrap">
      <button v-for="filter in FILTERS" :key="filter" @click="statusFilter = filter"
        :aria-pressed="statusFilter === filter"
        :class="['px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
          statusFilter === filter ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300']">
        {{ $t(`requests.filters.${filter}`) }}
        <span class="ml-1 text-xs opacity-70">({{ counts[filter] }})</span>
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <div v-for="request in visibleRequests" :key="request.id" class="card">
        <div class="flex items-start justify-between gap-3">
          <button class="flex-1 min-w-0 text-left" @click="toggleExpanded(request.id)"
            :aria-expanded="expandedId === request.id">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-semibold text-gray-900">
                {{ request.contact.company }}{{ request.contact.section ? ` / ${request.contact.section}` : '' }}
              </p>
              <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                STATUS_CLASSES[request.status]]">
                {{ $t(`status.${request.status}`) }}
              </span>
            </div>
            <p class="text-sm text-gray-600 mt-0.5">
              {{ request.contact.firstName }} {{ request.contact.lastName }} · {{ request.contact.phone }}
            </p>
            <p class="text-sm text-gray-500 mt-1">
              {{ formatDateTime(request.startDate) }} → {{ formatDateTime(request.endDate) }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ $t('requests.submittedOn', { date: formatDateTime(request.createdAt) }) }}
              · {{ $t('requests.count', request.vehicles.length, { count: request.vehicles.length }) }}
            </p>
          </button>

          <div class="flex flex-col gap-1 shrink-0">
            <button v-if="request.status !== 'approved'" @click="openApproval(request)"
              class="text-xs px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
              {{ $t('requests.approve') }}
            </button>
            <button v-if="request.status !== 'rejected'" @click="store.setStatus(request.id, 'rejected')"
              class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
              {{ $t('requests.reject') }}
            </button>
            <button v-if="request.status !== 'pending'" @click="store.setStatus(request.id, 'pending')"
              class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
              {{ $t('requests.reopen') }}
            </button>
            <button @click="deletedId = request.id" :aria-label="$t('requests.deleteTitle')"
              class="text-xs px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
              {{ $t('actions.delete') }}
            </button>
          </div>
        </div>

        <div v-if="expandedId === request.id" class="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm">
          <p class="text-gray-600">
            <span class="font-medium text-gray-700">{{ $t('requests.meetingPoint') }} :</span>
            {{ request.meetingPoint }}
          </p>
          <ul class="space-y-1">
            <li v-for="(entry, index) in request.vehicles" :key="index" class="flex items-center gap-2 text-gray-600">
              <span class="text-xs text-gray-400">{{ $t('requests.vehicleNumber', { number: index + 1 }) }}</span>
              <span class="font-medium">{{ $t(`requests.types.${entry.type}`) }}</span>
              <span v-if="entry.driverRequired"
                class="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                {{ $t('requests.driverRequired') }}
              </span>
            </li>
          </ul>
          <p v-if="request.comment" class="text-gray-500 italic">{{ request.comment }}</p>
        </div>
      </div>
    </TransitionGroup>

    <ListPlaceholder v-if="visibleRequests.length === 0"
      :loading="!store.loaded" :message="$t('requests.empty')" />

    <MissionForm v-if="missionPrefill" :mission="missionPrefill"
      @save="onMissionSave" @close="closeApproval" />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('requests.deleteTitle')"
      :message="$t('requests.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
