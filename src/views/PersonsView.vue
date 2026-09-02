<script setup>
import { ref, onMounted } from 'vue'
import { usePersonsStore } from '../stores/persons.js'
import { useMissionsStore } from '../stores/missions.js'
import PersonCard from '../components/persons/PersonCard.vue'
import PersonForm from '../components/persons/PersonForm.vue'
import LeavesModal from '../components/persons/LeavesModal.vue'
import PersonUnavailableModal from '../components/persons/PersonUnavailableModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const store = usePersonsStore()
const missionsStore = useMissionsStore()

onMounted(() => {
  store.init()
  missionsStore.init()
})

const showForm = ref(false)
const editedPerson = ref(null)
const deletedId = ref(null)
const leavesPerson = ref(null)
const unavailablePerson = ref(null)

function openCreate() {
  editedPerson.value = null
  showForm.value = true
}

function openEdit(person) {
  editedPerson.value = person
  showForm.value = true
}

function onSave(data) {
  if (editedPerson.value) store.update(editedPerson.value.id, data)
  else store.add(data)
  showForm.value = false
}

function onDelete() {
  store.remove(deletedId.value)
  deletedId.value = null
}

/** Marking someone unavailable asks for a reason; clearing it does not. */
function toggleUnavailable(person) {
  if (person.unavailable) store.clearUnavailable(person.id)
  else unavailablePerson.value = person
}

function confirmUnavailable(note) {
  store.markUnavailable(unavailablePerson.value.id, note)
  unavailablePerson.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('persons.title') }}</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <PersonCard
        v-for="person in store.persons"
        :key="person.id"
        :person="person"
        @edit="openEdit(person)"
        @delete="deletedId = person.id"
        @manage-leaves="leavesPerson = person"
        @toggle-unavailable="toggleUnavailable(person)"
      />
    </TransitionGroup>

    <ListPlaceholder v-if="store.persons.length === 0"
      :loading="!store.loaded" :message="$t('persons.empty')" />

    <PersonForm v-if="showForm" :person="editedPerson" @save="onSave" @close="showForm = false" />

    <LeavesModal v-if="leavesPerson" :person="leavesPerson" @close="leavesPerson = null" />

    <PersonUnavailableModal v-if="unavailablePerson" :person="unavailablePerson"
      @confirm="confirmUnavailable" @close="unavailablePerson = null" />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('persons.deleteTitle')"
      :message="$t('persons.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
