<script setup>
import { ref, onMounted } from 'vue'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import VehicleCard from '../components/vehicles/VehicleCard.vue'
import VehicleForm from '../components/vehicles/VehicleForm.vue'
import LoanModal from '../components/vehicles/LoanModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const store = useVehiclesStore()
const missionsStore = useMissionsStore()

onMounted(() => {
  store.init()
  missionsStore.init()
})

const showForm = ref(false)
const editingVehicle = ref(null)
const deletingId = ref(null)
const loanVehicle = ref(null)

function openCreate() {
  editingVehicle.value = null
  showForm.value = true
}

function openEdit(vehicle) {
  editingVehicle.value = vehicle
  showForm.value = true
}

function onSave(data) {
  if (editingVehicle.value) {
    store.update(editingVehicle.value.id, data)
  } else {
    store.add(data)
  }
  showForm.value = false
}

function onLoan(commentaire) {
  store.setPret(loanVehicle.value.id, commentaire)
  loanVehicle.value = null
}

function confirmDelete(id) {
  deletingId.value = id
}

function onDelete() {
  store.remove(deletingId.value)
  deletingId.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="page-title mb-0">Véhicules</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Ajouter
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <VehicleCard
        v-for="vehicle in store.vehicles"
        :key="vehicle.id"
        :vehicle="vehicle"
        @edit="openEdit(vehicle)"
        @delete="confirmDelete(vehicle.id)"
        @pret="loanVehicle = vehicle"
        @liberer="store.liberer(vehicle.id)"
      />
    </TransitionGroup>

    <p v-if="store.vehicles.length === 0" class="text-gray-400 text-sm italic">Aucun véhicule enregistré</p>

    <VehicleForm v-if="showForm" :vehicle="editingVehicle" @save="onSave" @close="showForm = false" />
    <LoanModal v-if="loanVehicle" :vehicle="loanVehicle" @save="onLoan" @close="loanVehicle = null" />

    <ConfirmModal
      v-if="deletingId"
      message="Êtes-vous sûr de vouloir supprimer ce véhicule ?"
      @confirm="onDelete"
      @cancel="deletingId = null"
    />
  </div>
</template>
