<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePersonsStore } from '../stores/persons.js'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useAuthStore } from '../stores/auth.js'
import PersonCard from '../components/persons/PersonCard.vue'
import PersonForm from '../components/persons/PersonForm.vue'
import LeavesModal from '../components/persons/LeavesModal.vue'
import PersonUnavailableModal from '../components/persons/PersonUnavailableModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'
import { filterBySearch } from '../search.js'

const store = usePersonsStore()
const missionsStore = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const auth = useAuthStore()
const { t, te } = useI18n()

onMounted(async () => {
  await store.init()
  missionsStore.init()
  vehiclesStore.init()
  store.loadAccounts()
})

const formError = ref('')

const search = ref('')

const visiblePersons = computed(() =>
  filterBySearch(store.persons, search.value, person => [
    person.rank, person.firstName, person.lastName, person.phone, person.notes, person.licenses,
  ])
)

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

/**
 * Saving a person and setting their password are two calls: the person lives
 * in its collection, the credentials in the accounts file. The password is
 * applied second, so a rejected one leaves the person saved and the form open
 * with the reason.
 */
async function onSave({ person, password }) {
  formError.value = ''
  const record = editedPerson.value
    ? (store.update(editedPerson.value.id, person), editedPerson.value)
    : store.add(person)

  if (password) {
    try {
      await store.setPassword(record.id, person.lastName, password)
    } catch (error) {
      const key = error.code ? `server.${error.code}` : null
      formError.value = key && te(key)
        ? t(key, error.params ?? {})
        : t('persons.accountFailed', { reason: error.message })
      return
    }
  }
  showForm.value = false
}

/** Missions that would be left with a dead reference by this deletion */
const impactedMissions = computed(() =>
  deletedId.value ? missionsStore.missionsWithPerson(deletedId.value).length : 0
)

const deleteMessage = computed(() => {
  const base = t('persons.deleteConfirm')
  if (!impactedMissions.value) return base
  return `${base} ${t('persons.deleteImpact', impactedMissions.value, { count: impactedMissions.value })}`
})

async function onDelete() {
  // Clear the references first, so no mission is ever left pointing at a
  // person who no longer exists — and take their account with them.
  // A key stays where it is; only the link to the deleted record goes, so
  // the board still says the key is out and under whose name.
  vehiclesStore.forgetPersonKeys(deletedId.value)
  missionsStore.forgetPerson(deletedId.value)
  if (store.hasAccount(deletedId.value)) {
    try {
      await store.removeAccount(deletedId.value)
    } catch { /* reported through the sync banner */ }
  }
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
      <button v-if="auth.can('persons.manage')" @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <SearchField v-model="search" class="mb-4 max-w-md" />

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <PersonCard
        v-for="person in visiblePersons"
        :key="person.id"
        :person="person"
        @edit="openEdit(person)"
        @delete="deletedId = person.id"
        @manage-leaves="leavesPerson = person"
        :can-manage="auth.can('persons.manage')"
        @toggle-unavailable="toggleUnavailable(person)"
      />
    </TransitionGroup>

    <ListPlaceholder v-if="visiblePersons.length === 0"
      :loading="!store.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('persons.empty')" />

    <PersonForm v-if="showForm" :person="editedPerson" :error="formError"
      @save="onSave" @close="showForm = false" />

    <LeavesModal v-if="leavesPerson" :person="leavesPerson" @close="leavesPerson = null" />

    <PersonUnavailableModal v-if="unavailablePerson" :person="unavailablePerson"
      @confirm="confirmUnavailable" @close="unavailablePerson = null" />

    <ConfirmModal
      v-if="deletedId"
      :title="$t('persons.deleteTitle')"
      :message="deleteMessage"
      @confirm="onDelete"
      @cancel="deletedId = null"
    />
  </div>
</template>
