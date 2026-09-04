<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRequestsStore } from '../stores/requests.js'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useConfigStore } from '../stores/config.js'
import { useAuthStore } from '../stores/auth.js'
import { REQUEST_STATUS, REQUEST_STATUSES } from '../constants.js'
import { formatDateTime } from '../datetime.js'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import MissionForm from '../components/missions/MissionForm.vue'
import BaseModal from '../components/common/BaseModal.vue'
import SearchField from '../components/common/SearchField.vue'
import { filterBySearch } from '../search.js'

const store = useRequestsStore()
const missionsStore = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const configStore = useConfigStore()
const auth = useAuthStore()
const { t } = useI18n()

/** A configured type may be custom, so its label comes from the store. */
function typeLabel(id) {
  const type = configStore.requestVehicleTypes.find(entry => entry.id === id)
  return type ? configStore.requestTypeLabel(type, t) : id
}

onMounted(() => {
  // The queue may have been loaded already for the sidebar badge; opening the
  // page must still show requests that arrived since.
  if (store.loaded) store.refresh()
  else store.init()
  missionsStore.init()
  vehiclesStore.init()
  personsStore.init()
  configStore.init()
})

const statusFilter = ref('all')
const search = ref('')
const rejecting = ref(null)
const rejectionReason = ref('')
const expandedId = ref(null)
const deletedId = ref(null)
/** A decided request going back into the queue: asked, since it undoes a decision. */
const reopening = ref(null)

async function reopen() {
  await store.setStatus(reopening.value.id, REQUEST_STATUS.PENDING)
  reopening.value = null
}
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

/** Search reaches the requester, their unit, the meeting point and the comment. */
function searchableFields(request) {
  const { contact } = request
  return [
    contact.firstName, contact.lastName, contact.company, contact.section, contact.phone,
    request.meetingPoint, request.comment, request.decisionReason, request.decidedBy,
    request.vehicles.map(entry => typeLabel(entry.type)),
  ]
}

/** Newest first: a queue is read from the most recent entry. */
const visibleRequests = computed(() => {
  const sorted = [...store.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const byStatus = statusFilter.value === 'all'
    ? sorted
    : sorted.filter(request => request.status === statusFilter.value)
  return filterBySearch(byStatus, search.value, searchableFields)
})

function openRejection(request) {
  rejecting.value = request
  rejectionReason.value = request.decisionReason ?? ''
}

async function confirmRejection() {
  await store.setStatus(rejecting.value.id, REQUEST_STATUS.REJECTED, rejectionReason.value)
  rejecting.value = null
  rejectionReason.value = ''
}

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
    const label = typeLabel(entry.type)
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
        :class="['px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
          statusFilter === filter ? 'bg-olive-600 border-olive-600 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-olive-300']">
        {{ $t(`requests.filters.${filter}`) }}
        <span class="ml-1 text-xs opacity-70">({{ counts[filter] }})</span>
      </button>
    </div>

    <SearchField v-model="search" class="mb-4 max-w-md" />

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <div v-for="request in visibleRequests" :key="request.id" class="card">
        <div class="flex items-start justify-between gap-3">
          <button class="flex-1 min-w-0 text-left" @click="toggleExpanded(request.id)"
            :aria-expanded="expandedId === request.id">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-semibold text-stone-900">
                {{ request.contact.company }}{{ request.contact.section ? ` / ${request.contact.section}` : '' }}
              </p>
              <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                STATUS_CLASSES[request.status]]">
                {{ $t(`status.${request.status}`) }}
              </span>
            </div>
            <p class="text-sm text-stone-600 mt-0.5">
              {{ request.contact.firstName }} {{ request.contact.lastName }} · {{ request.contact.phone }}
            </p>
            <p class="text-sm text-stone-500 mt-1">
              {{ formatDateTime(request.startDate) }} → {{ formatDateTime(request.endDate) }}
            </p>
            <p class="text-xs text-stone-400 mt-1">
              {{ $t('requests.submittedOn', { date: formatDateTime(request.createdAt) }) }}
              · {{ $t('requests.vehicleCount', request.vehicles.length, { count: request.vehicles.length }) }}
            </p>
            <p v-if="request.decidedBy" class="text-xs text-stone-500 mt-1">
              {{ $t('requests.decidedBy', {
                status: $t(`status.${request.status}`),
                user: request.decidedBy,
                date: formatDateTime(request.decidedAt),
              }) }}
            </p>
          </button>

          <div class="flex flex-col gap-1 shrink-0">
            <button v-if="auth.can('requests.manage') && request.status !== 'approved'" @click="openApproval(request)"
              class="btn-action border-green-300 bg-green-50 text-green-800 hover:bg-green-100 hover:border-green-400">
              {{ $t('requests.approve') }}
            </button>
            <button v-if="auth.can('requests.manage') && request.status !== 'rejected'" @click="openRejection(request)"
              class="btn-action">
              {{ $t('requests.reject') }}
            </button>
            <button v-if="auth.can('requests.manage') && request.status !== 'pending'" @click="reopening = request"
              class="btn-action">
              {{ $t('requests.reopen') }}
            </button>
            <button v-if="auth.can('requests.manage')" @click="deletedId = request.id"
              class="btn-action btn-action-danger">
              {{ $t('actions.delete') }}
            </button>
          </div>
        </div>

        <div v-if="expandedId === request.id" class="mt-3 pt-3 border-t border-stone-100 space-y-2 text-sm">
          <p class="text-stone-600">
            <span class="font-medium text-stone-700">{{ $t('requests.meetingPoint') }} :</span>
            {{ request.meetingPoint }}
          </p>
          <ul class="space-y-1">
            <li v-for="(entry, index) in request.vehicles" :key="index" class="flex items-center gap-2 text-stone-600">
              <span class="text-xs text-stone-400">{{ $t('requests.vehicleNumber', { number: index + 1 }) }}</span>
              <span class="font-medium">{{ typeLabel(entry.type) }}</span>
              <span v-if="entry.driverRequired"
                class="text-xs bg-olive-100 text-olive-700 rounded px-1.5 py-0.5">
                {{ $t('requests.driverRequired') }}
              </span>
            </li>
          </ul>
          <p v-if="request.comment" class="text-stone-500 italic">{{ request.comment }}</p>
          <p v-if="request.decisionReason" class="text-stone-600">
            <span class="font-medium text-stone-700">{{ $t('requests.reason') }} :</span>
            {{ request.decisionReason }}
          </p>
        </div>
      </div>
    </TransitionGroup>

    <ListPlaceholder v-if="visibleRequests.length === 0"
      :loading="!store.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('requests.empty')" />

    <BaseModal v-if="rejecting" :title="$t('requests.rejectTitle')" @close="rejecting = null">
      <form @submit.prevent="confirmRejection" class="space-y-4">
        <p class="text-sm text-stone-600">
          {{ rejecting.contact.company }} — {{ rejecting.contact.firstName }} {{ rejecting.contact.lastName }}
        </p>
        <div>
          <label class="label" for="rejection-reason">{{ $t('requests.reason') }}</label>
          <textarea id="rejection-reason" v-model="rejectionReason" class="input" rows="3"
            :placeholder="$t('requests.reasonPlaceholder')" autofocus />
        </div>
        <div class="flex justify-end gap-3 pt-1">
          <button type="button" @click="rejecting = null" class="btn-secondary">{{ $t('actions.cancel') }}</button>
          <button type="submit" class="btn-danger">{{ $t('requests.reject') }}</button>
        </div>
      </form>
    </BaseModal>

    <MissionForm v-if="missionPrefill" :mission="missionPrefill"
      @save="onMissionSave" @close="closeApproval" />

    <ConfirmModal
      v-if="reopening"
      :title="$t('requests.reopen')"
      :message="$t('requests.reopenConfirm', {
        company: reopening.contact.company || reopening.contact.lastName,
      })"
      :confirm-label="$t('requests.reopen')"
      tone="primary"
      @confirm="reopen"
      @cancel="reopening = null"
    />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('requests.deleteTitle')"
      :message="$t('requests.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
