<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRequestsStore } from '../stores/requests.js'
import { useConfigStore } from '../stores/config.js'
import { newId } from '../id.js'
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue'

/** Public form: reachable without a session, so it carries its own layout. */
const store = useRequestsStore()
const configStore = useConfigStore()
const { t, te } = useI18n()

// Readable without a session, which is what lets this public page work.
configStore.init()

const contact = reactive({ firstName: '', lastName: '', company: '', section: '', phone: '' })
const planning = reactive({ startDate: '', endDate: '', meetingPoint: '' })
const comment = ref('')
const vehicles = ref([newVehicleRow()])

const loading = ref(false)
const submitted = ref(false)
const error = ref('')

function newVehicleRow() {
  return { rowId: newId(), type: '', driverRequired: false }
}

function addVehicle() {
  vehicles.value.push(newVehicleRow())
}

function removeVehicle(rowId) {
  if (vehicles.value.length > 1) {
    vehicles.value = vehicles.value.filter(row => row.rowId !== rowId)
  }
}

function reset() {
  Object.assign(contact, { firstName: '', lastName: '', company: '', section: '', phone: '' })
  Object.assign(planning, { startDate: '', endDate: '', meetingPoint: '' })
  comment.value = ''
  vehicles.value = [newVehicleRow()]
  submitted.value = false
  error.value = ''
}

const canSubmit = computed(() =>
  Boolean(contact.firstName.trim() && contact.lastName.trim() && contact.company.trim() &&
    contact.phone.trim() && planning.startDate && planning.endDate && planning.meetingPoint.trim() &&
    vehicles.value.every(row => row.type))
)

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  loading.value = true
  try {
    await store.submit({
      contact: { ...contact },
      startDate: planning.startDate,
      endDate: planning.endDate,
      meetingPoint: planning.meetingPoint,
      comment: comment.value,
      vehicles: vehicles.value.map(({ type, driverRequired }) => ({ type, driverRequired })),
    })
    submitted.value = true
  } catch (err) {
    const key = err.code ? `server.${err.code}` : null
    error.value = key && te(key) ? t(key, err.params ?? {}) : (err.message || t('server.internal'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <header class="bg-white border-b border-stone-200 px-4 py-4">
      <div class="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <svg class="w-7 h-7 text-olive-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 21h18M3 7v1a3 3 0 006 0V7m0 1a3 3 0 006 0V7m0 1a3 3 0 006 0V7M3 7l3-4h12l3 4M5 21V7"/>
          </svg>
          <span class="font-bold text-stone-900">{{ $t('app.name') }}</span>
        </div>
        <div class="flex items-center gap-3">
          <LanguageSwitcher variant="light" />
          <RouterLink to="/login"
            class="text-xs text-stone-400 hover:text-stone-600 underline py-2.5 px-1 -my-2.5">
            {{ $t('requests.administration') }}
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-8">
      <div v-if="submitted" class="text-center py-16">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-stone-900 mb-2">{{ $t('requests.sent') }}</h2>
        <p class="text-stone-600 mb-6">{{ $t('requests.sentDetail') }}</p>
        <button @click="reset" class="btn-secondary">{{ $t('requests.newRequest') }}</button>
      </div>

      <template v-else>
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-stone-900">{{ $t('requests.publicTitle') }}</h1>
          <p class="text-sm text-stone-500 mt-1">{{ $t('requests.publicIntro') }}</p>
        </div>

        <form @submit.prevent="submit" class="space-y-6">
          <!-- Contact -->
          <div class="card space-y-4">
            <h2 class="text-base font-semibold text-stone-800">{{ $t('requests.contactSection') }}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="label" for="request-first-name">{{ $t('requests.firstName') }} *</label>
                <input id="request-first-name" v-model="contact.firstName" type="text" class="input" required />
              </div>
              <div>
                <label class="label" for="request-last-name">{{ $t('requests.lastName') }} *</label>
                <input id="request-last-name" v-model="contact.lastName" type="text" class="input" required />
              </div>
              <div>
                <label class="label" for="request-company">{{ $t('requests.company') }} *</label>
                <input id="request-company" v-model="contact.company" type="text" class="input"
                  :placeholder="$t('requests.companyPlaceholder')" required />
              </div>
              <div>
                <label class="label" for="request-section">{{ $t('requests.section') }}</label>
                <input id="request-section" v-model="contact.section" type="text" class="input"
                  :placeholder="$t('requests.sectionPlaceholder')" />
              </div>
              <div class="sm:col-span-2">
                <label class="label" for="request-phone">{{ $t('requests.phone') }} *</label>
                <input id="request-phone" v-model="contact.phone" type="tel" class="input"
                  :placeholder="$t('requests.phonePlaceholder')" required />
              </div>
            </div>
          </div>

          <!-- Planning -->
          <div class="card space-y-4">
            <h2 class="text-base font-semibold text-stone-800">{{ $t('requests.planningSection') }}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="label" for="request-start">{{ $t('requests.pickup') }} *</label>
                <input id="request-start" v-model="planning.startDate" type="datetime-local" class="input" required />
              </div>
              <div>
                <label class="label" for="request-end">{{ $t('requests.dropoff') }} *</label>
                <input id="request-end" v-model="planning.endDate" type="datetime-local" class="input"
                  :min="planning.startDate" required />
              </div>
              <div class="sm:col-span-2">
                <label class="label" for="request-meeting-point">{{ $t('requests.meetingPoint') }} *</label>
                <input id="request-meeting-point" v-model="planning.meetingPoint" type="text" class="input"
                  :placeholder="$t('requests.meetingPointPlaceholder')" required />
              </div>
              <div class="sm:col-span-2">
                <label class="label" for="request-comment">{{ $t('requests.comment') }}</label>
                <textarea id="request-comment" v-model="comment" class="input" rows="2"
                  :placeholder="$t('requests.commentPlaceholder')" />
              </div>
            </div>
          </div>

          <!-- Vehicles -->
          <div class="space-y-4">
            <h2 class="text-base font-semibold text-stone-800">
              {{ $t('requests.vehiclesSection') }}
              <span class="ml-1.5 text-xs font-normal text-stone-400">
                ({{ vehicles.length }})
              </span>
            </h2>

            <div v-for="(row, index) in vehicles" :key="row.rowId"
              class="card border-l-4 border-l-olive-500 space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-stone-700">
                  {{ $t('requests.vehicleNumber', { number: index + 1 }) }}
                </span>
                <button v-if="vehicles.length > 1" type="button" @click="removeVehicle(row.rowId)"
                  class="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
                  {{ $t('actions.delete') }}
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2">
                  <label class="label" :for="`request-type-${row.rowId}`">{{ $t('requests.vehicleType') }} *</label>
                  <select :id="`request-type-${row.rowId}`" v-model="row.type" class="input" required>
                    <option value="" disabled>{{ $t('requests.selectType') }}</option>
                    <option v-for="type in configStore.requestVehicleTypes" :key="type.id" :value="type.id">
                      {{ configStore.requestTypeLabel(type, $t) }}
                    </option>
                  </select>
                </div>
                <div class="flex items-end">
                  <!-- The whole row is the tap target: this page is filled in
                       on a phone almost every time. -->
                  <label class="flex items-center gap-3 cursor-pointer select-none w-full min-h-[44px] py-2 -mx-1 px-1 rounded-lg hover:bg-stone-50">
                    <input type="checkbox" v-model="row.driverRequired"
                      class="w-6 h-6 shrink-0 rounded border-stone-300 text-olive-600 focus:ring-olive-500" />
                    <span>
                      <span class="text-sm font-medium text-stone-700">{{ $t('requests.driverRequired') }}</span>
                      <span class="block text-xs text-stone-400">{{ $t('requests.driverRequiredHint') }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <button type="button" @click="addVehicle"
              class="w-full py-3 border-2 border-dashed border-stone-300 rounded-xl text-sm font-medium text-stone-500 hover:border-olive-400 hover:text-olive-600 hover:bg-olive-50/30 transition-colors">
              + {{ $t('requests.addVehicle') }}
            </button>
          </div>

          <p v-if="error" role="alert"
            class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {{ error }}
          </p>

          <div class="flex justify-end">
            <button type="submit" class="btn-primary px-8 w-full sm:w-auto justify-center"
              :disabled="loading || !canSubmit">
              <svg v-if="loading" class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {{ $t('requests.submit') }}
            </button>
          </div>
        </form>
      </template>
    </main>
  </div>
</template>
