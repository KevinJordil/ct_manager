<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '../stores/users.js'
import { usePersonsStore } from '../stores/persons.js'
import { useAuthStore } from '../stores/auth.js'
import { formatDateTime } from '../datetime.js'
import { personName } from '../labels.js'
import { suggestUsername, MIN_PASSWORD_LENGTH } from '../../users.js'
import BaseModal from '../components/common/BaseModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const store = useUsersStore()
const personsStore = usePersonsStore()
const auth = useAuthStore()
const { t, te } = useI18n()

onMounted(() => {
  store.init()
  personsStore.init()
})

const showForm = ref(false)
const editedUser = ref(null)
const deletedId = ref(null)
const formError = ref('')
const saving = ref(false)

const form = reactive({ username: '', password: '', role: 'user', personId: '' })

const sortedPersons = computed(() =>
  [...personsStore.persons].sort((a, b) => personName(a).localeCompare(personName(b)))
)

function personLabel(personId) {
  const person = personsStore.persons.find(candidate => candidate.id === personId)
  return person ? personName(person) : null
}

// Picking a person proposes a username, as long as the field is untouched.
watch(() => form.personId, personId => {
  if (editedUser.value || form.username) return
  const person = personsStore.persons.find(candidate => candidate.id === personId)
  if (person) form.username = suggestUsername(person.firstName, person.lastName)
})

function openCreate() {
  editedUser.value = null
  Object.assign(form, { username: '', password: '', role: 'user', personId: '' })
  formError.value = ''
  showForm.value = true
}

function openEdit(user) {
  editedUser.value = user
  Object.assign(form, {
    username: user.username,
    password: '',
    role: user.role,
    personId: user.personId ?? '',
  })
  formError.value = ''
  showForm.value = true
}

const canSubmit = computed(() => {
  if (!form.username.trim()) return false
  if (editedUser.value) return true
  return form.password.length >= MIN_PASSWORD_LENGTH
})

async function submit() {
  if (!canSubmit.value) return
  formError.value = ''
  saving.value = true
  try {
    const payload = {
      username: form.username.trim().toLowerCase(),
      role: form.role,
      personId: form.personId || null,
    }
    if (form.password) payload.password = form.password

    if (editedUser.value) await store.update(editedUser.value.id, payload)
    else await store.create(payload)
    showForm.value = false
  } catch (error) {
    const key = error.code ? `server.${error.code}` : null
    formError.value = key && te(key) ? t(key, error.params ?? {}) : (error.message || t('server.internal'))
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  await store.remove(deletedId.value)
  deletedId.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="page-title mb-0">{{ $t('users.title') }}</h1>
      <button @click="openCreate" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        {{ $t('actions.add') }}
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="space-y-3">
      <div v-for="user in store.users" :key="user.id" class="card">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-semibold text-gray-900 font-mono">{{ user.username }}</p>
              <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                user.role === 'admin' ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-700']">
                {{ user.role === 'admin' ? $t('users.roleAdmin') : $t('users.roleUser') }}
              </span>
              <span v-if="user.id === auth.user?.id" class="badge-gray">{{ $t('users.you') }}</span>
            </div>
            <p v-if="personLabel(user.personId)" class="text-sm text-gray-600 mt-0.5">
              {{ personLabel(user.personId) }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ $t('users.createdOn', { date: formatDateTime(user.createdAt) }) }}
            </p>
          </div>

          <div class="flex gap-1 shrink-0">
            <button @click="openEdit(user)" :aria-label="$t('users.edit')" :title="$t('actions.edit')" class="icon-btn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button v-if="user.id !== auth.user?.id" @click="deletedId = user.id"
              :aria-label="$t('users.deleteTitle')" :title="$t('actions.delete')"
              class="icon-btn text-red-400 hover:text-red-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <ListPlaceholder v-if="store.users.length === 0"
      :loading="!store.loaded" :message="$t('users.empty')" />

    <BaseModal v-if="showForm" :title="editedUser ? $t('users.edit') : $t('users.new')"
      @close="showForm = false">
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="label" for="user-person">{{ $t('users.person') }}</label>
          <select id="user-person" v-model="form.personId" class="input">
            <option value="">{{ $t('users.noPerson') }}</option>
            <option v-for="person in sortedPersons" :key="person.id" :value="person.id">
              {{ personName(person) }}
            </option>
          </select>
        </div>

        <div>
          <label class="label" for="user-username">
            {{ $t('users.username') }} *
            <span class="font-normal text-gray-400">({{ $t('users.usernameHint') }})</span>
          </label>
          <input id="user-username" v-model="form.username" class="input"
            autocapitalize="none" spellcheck="false" required />
        </div>

        <div>
          <label class="label" for="user-password">
            {{ editedUser ? $t('users.newPasswordOptional') : `${$t('users.password')} *` }}
          </label>
          <input id="user-password" v-model="form.password" type="password" class="input"
            autocomplete="new-password" :minlength="MIN_PASSWORD_LENGTH"
            :required="!editedUser" />
        </div>

        <div>
          <span class="label" id="user-role-label">{{ $t('users.role') }}</span>
          <div class="space-y-2" role="radiogroup" aria-labelledby="user-role-label">
            <label v-for="role in ['user', 'admin']" :key="role"
              class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
              :class="form.role === role ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'">
              <input type="radio" :value="role" v-model="form.role" class="mt-0.5 w-4 h-4 text-blue-600" />
              <span>
                <span class="text-sm font-medium text-gray-800">
                  {{ role === 'admin' ? $t('users.roleAdmin') : $t('users.roleUser') }}
                </span>
                <span class="block text-xs text-gray-500">
                  {{ role === 'admin' ? $t('users.roleAdminHint') : $t('users.roleUserHint') }}
                </span>
              </span>
            </label>
          </div>
        </div>

        <p v-if="formError" role="alert"
          class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ formError }}
        </p>

        <div class="flex justify-end gap-3 pt-1">
          <button type="button" @click="showForm = false" class="btn-secondary">{{ $t('actions.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving || !canSubmit">
            {{ editedUser ? $t('actions.save') : $t('actions.create') }}
          </button>
        </div>
      </form>
    </BaseModal>

    <ConfirmModal v-if="deletedId"
      :title="$t('users.deleteTitle')"
      :message="$t('users.deleteConfirm')"
      @confirm="onDelete"
      @cancel="deletedId = null" />
  </div>
</template>
