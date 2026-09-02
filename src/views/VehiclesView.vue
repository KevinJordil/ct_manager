<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import VehicleCard from '../components/vehicles/VehicleCard.vue'
import VehicleForm from '../components/vehicles/VehicleForm.vue'
import LoanModal from '../components/vehicles/LoanModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const store = useVehiclesStore()
const missionsStore = useMissionsStore()
const { t } = useI18n()

onMounted(() => {
  store.init()
  missionsStore.init()
})

const showForm = ref(false)
const editedVehicle = ref(null)
const deletedId = ref(null)
const lentVehicle = ref(null)

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

function confirmLoan(note) {
  store.lend(lentVehicle.value.id, note)
  lentVehicle.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('vehicles.title') }}</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <VehicleCard
        v-for="vehicle in store.vehicles"
        :key="vehicle.id"
        :vehicle="vehicle"
        @edit="openEdit(vehicle)"
        @delete="deletedId = vehicle.id"
        @lend="lentVehicle = vehicle"
        @release="store.release(vehicle.id)"
      />
    </TransitionGroup>

    <ListPlaceholder v-if="store.vehicles.length === 0"
      :loading="!store.loaded" :message="$t('vehicles.empty')" />

    <VehicleForm v-if="showForm" :vehicle="editedVehicle" @save="onSave" @close="showForm = false" />

    <LoanModal v-if="lentVehicle" :vehicle="lentVehicle"
      @confirm="confirmLoan" @close="lentVehicle = null" />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('vehicles.deleteTitle')"
      :message="deleteMessage"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
