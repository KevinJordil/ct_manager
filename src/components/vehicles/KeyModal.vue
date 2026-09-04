<script setup>
import { computed, ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore } from '../../stores/persons.js'
import { useAuthStore } from '../../stores/auth.js'
import { formatDateTime } from '../../datetime.js'
import { personName } from '../../labels.js'
import { holderName } from '../../keys.js'

const props = defineProps({ vehicle: { type: Object, required: true } })
const emit = defineEmits(['confirm', 'close'])

const personsStore = usePersonsStore()
const auth = useAuthStore()

const holder = computed(() => props.vehicle.keyHolder)

/** The person behind the signed-in account, when there is one. */
const self = computed(() =>
  auth.user?.personId
    ? personsStore.persons.find(person => person.id === auth.user.personId) ?? null
    : null
)
// The signed-in person first, so the pre-selected entry is visible without
// scrolling the list; everybody else alphabetically.
const persons = computed(() => {
  const sorted = [...personsStore.persons].sort((a, b) => personName(a).localeCompare(personName(b)))
  const mine = sorted.findIndex(person => person.id === self.value?.id)
  if (mine <= 0) return sorted
  return [sorted[mine], ...sorted.slice(0, mine), ...sorted.slice(mine + 1)]
})

/** Either a declared person, or somebody outside the application. */
const mode = ref('person')
// Taking a key for oneself is the common case, so start there; anybody else
// is one click away in the list.
const personId = ref(self.value?.id ?? '')
const outsideName = ref('')
const search = ref('')

const matching = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return persons.value
  return persons.value.filter(person => personName(person).toLowerCase().includes(needle))
})

const isSelf = id => id === self.value?.id

const chosen = computed(() =>
  mode.value === 'person'
    ? personId.value !== ''
    : outsideName.value.trim() !== ''
)

function submit() {
  if (!chosen.value) return
  if (mode.value === 'person') {
    const person = persons.value.find(p => p.id === personId.value)
    emit('confirm', { personId: person.id, name: personName(person) })
  } else {
    emit('confirm', { personId: null, name: outsideName.value.trim() })
  }
}
</script>

<template>
  <BaseModal :title="holder ? $t('keys.transferTitle') : $t('keys.takeTitle')" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-stone-600">
        {{ $t('keys.vehicle') }} <strong class="plate">{{ vehicle.plate }}</strong>
        <span class="text-stone-400 ml-1">{{ vehicle.name }}</span>
      </p>

      <p v-if="holder" class="text-sm rounded border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
        {{ $t('keys.currentHolder', {
          name: holderName(holder, personsStore.persons),
          date: formatDateTime(holder.since),
        }) }}
      </p>

      <div class="flex gap-2">
        <button type="button" @click="mode = 'person'"
          :class="['flex-1 rounded-lg border px-3 py-2 text-sm font-medium min-h-[36px]',
            mode === 'person' ? 'border-olive-500 bg-olive-50 text-olive-700' : 'border-stone-300 text-stone-600']">
          {{ $t('keys.aPerson') }}
        </button>
        <button type="button" @click="mode = 'outside'"
          :class="['flex-1 rounded-lg border px-3 py-2 text-sm font-medium min-h-[36px]',
            mode === 'outside' ? 'border-olive-500 bg-olive-50 text-olive-700' : 'border-stone-300 text-stone-600']">
          {{ $t('keys.outside') }}
        </button>
      </div>

      <div v-if="mode === 'person'" class="space-y-2">
        <label class="label" for="key-search">{{ $t('keys.whoTakes') }}</label>
        <input id="key-search" v-model="search" type="search" class="input"
          :placeholder="$t('keys.searchPerson')" autocomplete="off" />
        <div class="max-h-56 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
          <button v-for="person in matching" :key="person.id" type="button"
            @click="personId = person.id"
            :class="['w-full text-left px-3 py-2 text-sm min-h-[40px]',
              personId === person.id ? 'bg-olive-50 text-olive-800 font-medium' : 'hover:bg-stone-50']">
            {{ personName(person) }}
            <span v-if="isSelf(person.id)" class="text-stone-400 font-normal">{{ $t('keys.you') }}</span>
          </button>
          <p v-if="!matching.length" class="px-3 py-2 text-sm text-stone-400 italic">
            {{ $t('keys.noPerson') }}
          </p>
        </div>
      </div>

      <div v-else>
        <label class="label" for="key-outside">{{ $t('keys.outsideName') }} *</label>
        <input id="key-outside" v-model="outsideName" type="text" class="input"
          :placeholder="$t('keys.outsidePlaceholder')" maxlength="80" />
        <p class="mt-1 text-xs text-stone-500">{{ $t('keys.outsideHint') }}</p>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="!chosen">
          {{ holder ? $t('keys.confirmTransfer') : $t('keys.confirmTake') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
