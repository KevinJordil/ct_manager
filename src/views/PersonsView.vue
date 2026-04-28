<script setup>
import { ref, onMounted } from 'vue'
import { usePersonsStore } from '../stores/persons.js'
import { useMissionsStore } from '../stores/missions.js'
import PersonCard from '../components/persons/PersonCard.vue'
import PersonForm from '../components/persons/PersonForm.vue'
import CongesModal from '../components/persons/CongesModal.vue'
import PersonIndisponibleModal from '../components/persons/PersonIndisponibleModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const store = usePersonsStore()
const missionsStore = useMissionsStore()
onMounted(() => { store.init(); missionsStore.init() })

const showForm = ref(false)
const editingPerson = ref(null)
const deletingId = ref(null)
const congesPerson = ref(null)
const indisponiblePerson = ref(null)

function openCreate() {
  editingPerson.value = null
  showForm.value = true
}

function openEdit(person) {
  editingPerson.value = person
  showForm.value = true
}

function onSave(data) {
  if (editingPerson.value) {
    store.update(editingPerson.value.id, data)
  } else {
    store.add(data)
  }
  showForm.value = false
}

function confirmDelete(id) {
  deletingId.value = id
}

function onDelete() {
  store.remove(deletingId.value)
  deletingId.value = null
}

function onToggleIndisponible(person) {
  if (person.indisponible) {
    store.clearIndisponible(person.id)
  } else {
    indisponiblePerson.value = person
  }
}

function onSaveIndisponible(commentaire) {
  store.setIndisponible(indisponiblePerson.value.id, commentaire)
  indisponiblePerson.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="page-title mb-0">Personnes</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Ajouter
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <PersonCard
        v-for="person in store.persons"
        :key="person.id"
        :person="person"
        @edit="openEdit(person)"
        @delete="confirmDelete(person.id)"
        @manage-conges="congesPerson = person"
        @toggle-indisponible="onToggleIndisponible(person)"
      />
    </TransitionGroup>

    <p v-if="store.persons.length === 0" class="text-gray-400 text-sm italic">Aucune personne enregistrée</p>

    <PersonForm v-if="showForm" :person="editingPerson" @save="onSave" @close="showForm = false" />
    <CongesModal v-if="congesPerson" :person="congesPerson" @close="congesPerson = null" />
    <PersonIndisponibleModal v-if="indisponiblePerson" :person="indisponiblePerson"
      @save="onSaveIndisponible" @close="indisponiblePerson = null" />

    <ConfirmModal
      v-if="deletingId"
      message="Êtes-vous sûr de vouloir supprimer cette personne ?"
      @confirm="onDelete"
      @cancel="deletingId = null"
    />
  </div>
</template>
