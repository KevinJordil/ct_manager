<script setup>
import { reactive, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { useConfigStore } from '../../stores/config.js'
import { LICENSE_PICKER_COLORS } from '../../labels.js'

const props = defineProps({ person: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const configStore = useConfigStore()
configStore.init()

const form = reactive({ rank: '', firstName: '', lastName: '', phone: '', licenses: [], notes: '' })

watch(() => props.person, person => {
  form.rank = person?.rank ?? ''
  form.firstName = person?.firstName ?? ''
  form.lastName = person?.lastName ?? ''
  form.phone = person?.phone ?? ''
  form.licenses = [...(person?.licenses ?? [])]
  form.notes = person?.notes ?? ''
}, { immediate: true })

function toggleLicense(license) {
  const index = form.licenses.indexOf(license)
  if (index === -1) form.licenses.push(license)
  else form.licenses.splice(index, 1)
}

function submit() {
  if (!form.firstName.trim() || !form.lastName.trim()) return
  emit('save', { ...form })
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

      <div>
        <label class="label" for="person-notes">{{ $t('persons.notes') }}</label>
        <textarea id="person-notes" v-model="form.notes" class="input" rows="3"
          :placeholder="$t('persons.notesPlaceholder')" />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ person ? $t('actions.save') : $t('actions.create') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
