<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTrailersStore } from '../stores/trailers.js'
import { useMissionsStore } from '../stores/missions.js'
import { useConfigStore } from '../stores/config.js'
import { useAuthStore } from '../stores/auth.js'
import { useClock } from '../stores/clock.js'
import { getTrailerStatus, ongoingMissions, missionInvolvesTrailer } from '../availability.js'
import { AWAY_STATUSES, VEHICLE_STATUS } from '../constants.js'
import { formatDateTime } from '../datetime.js'
import { filterBySearch } from '../search.js'
import StatusBadge from '../components/common/StatusBadge.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'
import LoanModal from '../components/vehicles/LoanModal.vue'
import TrailerForm from '../components/trailers/TrailerForm.vue'

const store = useTrailersStore()
const missionsStore = useMissionsStore()
const configStore = useConfigStore()
const auth = useAuthStore()
const { nowString, todayString } = useClock()

onMounted(() => {
  store.init()
  missionsStore.init()
  configStore.init()
})

const canManage = computed(() => auth.can('vehicles.manage'))
const search = ref('')

const rows = computed(() => {
  const running = ongoingMissions(missionsStore.missions, nowString.value)
  return filterBySearch(store.trailers, search.value, trailer => [trailer.plate, trailer.name, trailer.notes,
    ...(trailer.compatibleTypes ?? []).map(configStore.vehicleTypeLabel)])
    .sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''))
    .map(trailer => ({
      trailer,
      status: getTrailerStatus(trailer, missionsStore.missions, nowString.value),
      mission: running.find(mission => missionInvolvesTrailer(mission, trailer.id)) ?? null,
      away: AWAY_STATUSES.includes(trailer.status),
      overdue: AWAY_STATUSES.includes(trailer.status) && trailer.loanUntil && trailer.loanUntil < todayString.value,
    }))
})

// ── Create and edit ──

const showForm = ref(false)
const edited = ref(null)

function openCreate() { edited.value = null; showForm.value = true }
function openEdit(trailer) { edited.value = trailer; showForm.value = true }

/** The form stays open until the server has the trailer. */
async function onSave(data) {
  const saved = edited.value ? await store.update(edited.value.id, data) : Boolean(await store.add(data))
  if (saved) showForm.value = false
}

// ── Away and back ──

const awayTrailer = ref(null)
const awayKind = ref('on-loan')

function sendAway(trailer, kind) { awayTrailer.value = trailer; awayKind.value = kind }

async function confirmAway(absence) {
  if (await store.lend(awayTrailer.value.id, absence)) awayTrailer.value = null
}

const releasing = ref(null)
const releaseTexts = computed(() =>
  releasing.value?.status === VEHICLE_STATUS.ON_LOAN ? 'vehicles.loan' : 'vehicles.outOfService')

async function release() {
  if (await store.release(releasing.value.id)) releasing.value = null
}

// ── Delete ──

const deleting = ref(null)

async function onDelete() {
  if (await store.remove(deleting.value.id)) {
    deleting.value = null
    // The server kept a copy of the trailer in its past missions.
    await missionsStore.reload()
  } else {
    deleting.value = null
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('trailers.title') }}</h1>
      <button v-if="canManage" @click="openCreate" class="btn-primary">{{ $t('trailers.new') }}</button>
    </div>
    <p class="text-sm text-stone-500 mb-4">{{ $t('trailers.intro') }}</p>

    <SearchField v-model="search" class="mb-4 max-w-md" />

    <div class="space-y-3">
      <div v-for="row in rows" :key="row.trailer.id" class="card">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <p class="plate text-lg">{{ row.trailer.plate }}</p>
              <span class="text-sm text-stone-500">{{ row.trailer.name }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1 items-center">
              <StatusBadge :status="row.status" />
              <span v-for="type in row.trailer.compatibleTypes" :key="type" class="badge-gray">
                {{ configStore.vehicleTypeLabel(type) }}
              </span>
              <span v-if="!row.trailer.compatibleTypes?.length" class="text-xs text-amber-700">
                {{ $t('trailers.noCompatible') }}
              </span>
            </div>
            <p v-if="row.mission" class="mt-2 text-sm text-orange-700">{{ row.mission.title }}</p>
            <div v-if="row.away" class="mt-2 space-y-1">
              <p v-if="row.trailer.loanNote" class="text-sm text-red-600 italic">{{ row.trailer.loanNote }}</p>
              <p v-if="row.trailer.loanUntil"
                :class="['text-xs', row.overdue ? 'text-red-700 font-medium' : 'text-stone-500']">
                {{ row.overdue
                  ? $t('vehicles.loanOverdue', { date: formatDateTime(row.trailer.loanUntil) })
                  : $t('vehicles.loanUntilLabel', { date: formatDateTime(row.trailer.loanUntil) }) }}
              </p>
            </div>
            <p v-if="row.trailer.notes" class="mt-2 text-sm text-stone-600">{{ row.trailer.notes }}</p>
          </div>

          <div v-if="canManage" class="flex flex-wrap gap-1.5 shrink-0">
            <template v-if="!row.away">
              <button @click="sendAway(row.trailer, 'on-loan')" class="btn-action">{{ $t('vehicles.loan.lend') }}</button>
              <button @click="sendAway(row.trailer, 'out-of-service')" class="btn-action">{{ $t('vehicles.outOfService.action') }}</button>
            </template>
            <button v-else @click="releasing = row.trailer" class="btn-action">
              {{ row.trailer.status === 'on-loan' ? $t('vehicles.loan.release') : $t('vehicles.outOfService.release') }}
            </button>
            <button @click="openEdit(row.trailer)" class="btn-action">{{ $t('actions.edit') }}</button>
            <button @click="deleting = row.trailer" class="btn-action btn-action-danger">{{ $t('actions.delete') }}</button>
          </div>
        </div>
      </div>
    </div>

    <ListPlaceholder v-if="rows.length === 0" :loading="!store.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('trailers.empty')" />

    <TrailerForm v-if="showForm" :trailer="edited" @save="onSave" @close="showForm = false" />
    <LoanModal v-if="awayTrailer" :vehicle="awayTrailer" :kind="awayKind"
      @confirm="confirmAway" @close="awayTrailer = null" />
    <ConfirmModal v-if="releasing" :title="$t(releaseTexts + '.release')"
      :message="$t(releaseTexts + '.releaseConfirm', { plate: releasing.plate })"
      :confirm-label="$t(releaseTexts + '.release')" tone="primary"
      @confirm="release" @cancel="releasing = null" />
    <ConfirmModal v-if="deleting" :title="$t('trailers.delete')"
      :message="$t('trailers.deleteConfirm', { plate: deleting.plate })"
      :confirm-label="$t('trailers.delete')"
      @confirm="onDelete" @cancel="deleting = null" />
  </div>
</template>
