<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { usePersonsStore } from '../stores/persons.js'
import { useAuthStore } from '../stores/auth.js'
import VehicleCard from '../components/vehicles/VehicleCard.vue'
import VehicleForm from '../components/vehicles/VehicleForm.vue'
import LoanModal from '../components/vehicles/LoanModal.vue'
import KeyModal from '../components/vehicles/KeyModal.vue'
import KeyHistoryModal from '../components/vehicles/KeyHistoryModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'
import { filterBySearch } from '../search.js'
import { holderName, recorderName } from '../keys.js'
import { fleetByCategory } from '../fleet.js'
import { useClock } from '../stores/clock.js'

const store = useVehiclesStore()
const missionsStore = useMissionsStore()
const personsStore = usePersonsStore()
const auth = useAuthStore()
const { t } = useI18n()

onMounted(() => {
  store.init()
  missionsStore.init()
  personsStore.init()
})

const { nowString } = useClock()

const search = ref('')

/**
 * Somebody looking for a vehicle wants a type — a heavy one, a light
 * off-road one — so the list is read type by type, each with what can be
 * taken right now.
 */
const groups = computed(() =>
  fleetByCategory(visibleVehicles.value, missionsStore.missions, nowString.value)
)

/** All types, or the one being looked at. */
const category = ref('')
const shownGroups = computed(() =>
  category.value ? groups.value.filter(group => group.category === category.value) : groups.value
)

/** The tally of a type is read at a glance, so it is spelt out in words. */
function summaryOf(group) {
  const parts = []
  if (group.onMission) parts.push(t('vehicles.onMissionCount', group.onMission, { count: group.onMission }))
  if (group.onLoan) parts.push(t('vehicles.onLoanCount', group.onLoan, { count: group.onLoan }))
  if (group.keyOut) parts.push(t('vehicles.keyOutCount', group.keyOut, { count: group.keyOut }))
  return parts.join(' · ')
}

const visibleVehicles = computed(() =>
  filterBySearch(store.vehicles, search.value, vehicle => [
    vehicle.name, vehicle.plate, vehicle.loanNote,
    t(`vehicles.categories.${vehicle.category}`),
    // Searching a name finds the vehicle whose key that person is holding.
    holderName(vehicle.keyHolder, personsStore.persons),
  ])
)

const showForm = ref(false)
const editedVehicle = ref(null)
const deletedId = ref(null)
const lentVehicle = ref(null)
const keyVehicle = ref(null)
const historyVehicle = ref(null)

function openCreate() {
  editedVehicle.value = null
  showForm.value = true
}

function openEdit(vehicle) {
  editedVehicle.value = vehicle
  showForm.value = true
}

function onSave(data) {
  if (editedVehicle.value) store.update(editedVehicle.value.id, data)
  else store.add(data)
  showForm.value = false
}

const impactedMissions = computed(() =>
  deletedId.value ? missionsStore.missionsWithVehicle(deletedId.value).length : 0
)

const deleteMessage = computed(() => {
  const base = t('vehicles.deleteConfirm')
  if (!impactedMissions.value) return base
  return `${base} ${t('vehicles.deleteImpact', impactedMissions.value, { count: impactedMissions.value })}`
})

function onDelete() {
  // Clear the references first: a mission must never point at a vehicle that
  // no longer exists.
  missionsStore.forgetVehicle(deletedId.value)
  store.remove(deletedId.value)
  deletedId.value = null
}

// Who did it, as a reader of the log would name them — anybody may move
// anybody else's key, so the two names are not the same question.
const recordedBy = computed(() => recorderName(auth.user, personsStore.persons))

function confirmKey(holder) {
  store.takeKey(keyVehicle.value.id, { ...holder, recordedBy: recordedBy.value })
  keyVehicle.value = null
}

/**
 * Hanging up a key and ending a loan act on somebody else's doing, and they
 * fire from a single click on a list. Both are asked first, naming who or
 * what is concerned so a misplaced click is caught by reading the question.
 */
const returningVehicle = ref(null)
const releasingVehicle = ref(null)

const returnMessage = computed(() => {
  const vehicle = returningVehicle.value
  if (!vehicle) return ''
  return t('keys.returnConfirm', {
    plate: vehicle.plate,
    name: holderName(vehicle.keyHolder, personsStore.persons),
  })
})

function returnKey() {
  store.returnKey(returningVehicle.value.id, { recordedBy: recordedBy.value })
  returningVehicle.value = null
}

function release() {
  store.release(releasingVehicle.value.id)
  releasingVehicle.value = null
}

function confirmLoan(loan) {
  store.lend(lentVehicle.value.id, loan)
  lentVehicle.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('vehicles.title') }}</h1>
      <button v-if="auth.can('vehicles.manage')" @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <SearchField v-model="search" class="mb-4 max-w-md" />

    <!-- One button per type: the count is the answer to "can I take one?" -->
    <div v-if="groups.length > 1" class="mb-4 flex flex-wrap gap-2">
      <button type="button" @click="category = ''"
        :class="['btn-action', category === '' ? 'border-olive-400 bg-olive-50 text-olive-800' : '']">
        {{ $t('vehicles.allTypes') }}
        <span class="font-mono text-xs">{{ groups.reduce((n, g) => n + g.available, 0) }}/{{ visibleVehicles.length }}</span>
      </button>
      <button v-for="group in groups" :key="group.category" type="button"
        @click="category = category === group.category ? '' : group.category"
        :class="['btn-action', category === group.category ? 'border-olive-400 bg-olive-50 text-olive-800' : '']">
        {{ $t(`vehicles.categories.${group.category}`) }}
        <span :class="['font-mono text-xs', group.available ? 'text-green-700' : 'text-red-700']">
          {{ group.available }}/{{ group.total }}
        </span>
      </button>
    </div>

    <section v-for="group in shownGroups" :key="group.category" class="mb-6 last:mb-0">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 class="section-title mb-0">{{ $t(`vehicles.categories.${group.category}`) }}</h2>
        <p :class="['text-sm font-medium', group.available ? 'text-green-800' : 'text-red-800']">
          {{ $t('vehicles.availableOf', { available: group.available, total: group.total }) }}
        </p>
        <p v-if="summaryOf(group)" class="text-xs text-stone-500">{{ summaryOf(group) }}</p>
      </div>

      <TransitionGroup name="list" tag="div" class="space-y-3">
        <VehicleCard
          v-for="vehicle in group.vehicles"
          :key="vehicle.id"
          :vehicle="vehicle"
          @edit="openEdit(vehicle)"
          @delete="deletedId = vehicle.id"
          @lend="lentVehicle = vehicle"
          @release="releasingVehicle = vehicle"
          @key-take="keyVehicle = vehicle"
          @key-return="returningVehicle = vehicle"
          @key-history="historyVehicle = vehicle"
          :can-manage="auth.can('vehicles.manage')"
        />
      </TransitionGroup>
    </section>

    <ListPlaceholder v-if="visibleVehicles.length === 0"
      :loading="!store.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('vehicles.empty')" />

    <VehicleForm v-if="showForm" :vehicle="editedVehicle" @save="onSave" @close="showForm = false" />

    <LoanModal v-if="lentVehicle" :vehicle="lentVehicle"
      @confirm="confirmLoan" @close="lentVehicle = null" />

    <KeyModal v-if="keyVehicle" :vehicle="keyVehicle"
      @confirm="confirmKey" @close="keyVehicle = null" />

    <KeyHistoryModal v-if="historyVehicle" :vehicle="historyVehicle"
      @close="historyVehicle = null" />

    <ConfirmModal
      v-if="returningVehicle"
      :title="$t('keys.returnShort')"
      :message="returnMessage"
      :confirm-label="$t('keys.returnShort')"
      tone="primary"
      @confirm="returnKey"
      @cancel="returningVehicle = null"
    />

    <ConfirmModal
      v-if="releasingVehicle"
      :title="$t('vehicles.loan.release')"
      :message="$t('vehicles.loan.releaseConfirm', { plate: releasingVehicle.plate })"
      :confirm-label="$t('vehicles.loan.release')"
      tone="primary"
      @confirm="release"
      @cancel="releasingVehicle = null"
    />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('vehicles.deleteTitle')"
      :message="deleteMessage"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
