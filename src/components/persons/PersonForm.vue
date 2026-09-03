<script setup>
import { reactive, computed, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { useConfigStore } from '../../stores/config.js'
import { usePersonsStore } from '../../stores/persons.js'
import { LICENSE_PICKER_COLORS } from '../../labels.js'
import { usernameFromLastName } from '../../../users.js'

const props = defineProps({
  person: { type: Object, default: null },
  error: { type: String, default: '' },
})
const emit = defineEmits(['save', 'close'])

const configStore = useConfigStore()
const personsStore = usePersonsStore()
configStore.init()

const form = reactive({
  rank: '', firstName: '', lastName: '', phone: '', licenses: [], notes: '', password: '',
})

/** An existing person may already sign in; a new one never does yet. */
const hasAccount = computed(() => Boolean(props.person && personsStore.hasAccount(props.person.id)))

/** The login the person will use, shown live as the family name is typed. */
const futureUsername = computed(() => usernameFromLastName(form.lastName))

const passwordRequired = computed(() => !props.person)

watch(() => props.person, person => {
  form.rank = person?.rank ?? ''
  form.firstName = person?.firstName ?? ''
  form.lastName = person?.lastName ?? ''
  form.phone = person?.phone ?? ''
  form.licenses = [...(person?.licenses ?? [])]
  form.notes = person?.notes ?? ''
  form.password = ''
}, { immediate: true })

function toggleLicense(license) {
  const index = form.licenses.indexOf(license)
  if (index === -1) form.licenses.push(license)
  else form.licenses.splice(index, 1)
}

function submit() {
  if (!form.firstName.trim() || !form.lastName.trim()) return
  if (passwordRequired.value && !form.password) return
  const { password, ...person } = form
  emit('save', { person, password })
}
</script>

<template>
  <BaseModal :title="person ? $t('persons.edit') : $t('persons.new')" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="label" for="person-rank">{{ $t('persons.rank') }}</label>
          <input id="person-rank" v-model="form.rank" class="input" :placeholder="$t('persons.rankPlaceholder')" />
        </div>
        <div>
          <label class="label" for="person-first-name">{{ $t('persons.firstName') }} *</label>
          <input id="person-first-name" v-model="form.firstName" class="input"
            :placeholder="$t('persons.firstNamePlaceholder')" required />
        </div>
        <div>
          <label class="label" for="person-last-name">{{ $t('persons.lastName') }} *</label>
          <input id="person-last-name" v-model="form.lastName" class="input"
            :placeholder="$t('persons.lastNamePlaceholder')" required />
        </div>
      </div>

      <div>
        <label class="label" for="person-phone">{{ $t('persons.phone') }}</label>
        <input id="person-phone" v-model="form.phone" type="tel" class="input"
          :placeholder="$t('persons.phonePlaceholder')" />
      </div>

      <div>
        <span class="label" id="person-licenses-label">{{ $t('persons.licenses') }}</span>
        <div class="flex flex-wrap gap-2 mt-1" role="group" aria-labelledby="person-licenses-label">
          <button v-for="license in configStore.licenses" :key="license" type="button"
            @click="toggleLicense(license)"
            :aria-pressed="form.licenses.includes(license)"
            :class="['px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              form.licenses.includes(license)
                ? LICENSE_PICKER_COLORS[license]
                : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400']">
            {{ license }}
          </button>
        </div>
      </div>

      <!-- Credentials: a person without a password simply cannot sign in. -->
      <div>
        <label class="label" for="person-password">
          {{ hasAccount ? $t('persons.passwordOptional') : $t('persons.password') }}
          <span v-if="passwordRequired"> *</span>
        </label>
        <input id="person-password" v-model="form.password" type="password" class="input"
          autocomplete="new-password" :required="passwordRequired" />
        <p class="mt-1 text-xs text-gray-400">
          {{ $t('persons.passwordHint') }}
          <span v-if="futureUsername.length >= 3">
            {{ $t('persons.loginAs', { username: futureUsername }) }}
          </span>
        </p>
      </div>

      <div>
        <label class="label" for="person-notes">{{ $t('persons.notes') }}</label>
        <textarea id="person-notes" v-model="form.notes" class="input" rows="3"
          :placeholder="$t('persons.notesPlaceholder')" />
      </div>

      <p v-if="error" role="alert"
        class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {{ error }}
      </p>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ person ? $t('actions.save') : $t('actions.create') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
