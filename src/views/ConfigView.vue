<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '../stores/config.js'
import { VEHICLE_CATEGORIES } from '../constants.js'
import { isBuiltInRequestType } from '../config.js'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const store = useConfigStore()
const { t } = useI18n()

onMounted(() => store.init())

/**
 * Edited on a local copy: nothing reaches the server until the operator
 * saves, so a half-finished matrix never takes effect.
 */
const draft = reactive({
  requestVehicleTypes: [],
  licenses: [],
  licensesByCategory: {},
  trailerLicensesByCategory: {},
})

watch(() => store.config, config => {
  draft.requestVehicleTypes = config.requestVehicleTypes.map(type => ({ ...type }))
  draft.licenses = [...config.licenses]
  draft.licensesByCategory = Object.fromEntries(
    Object.entries(config.licensesByCategory).map(([key, value]) => [key, [...value]]))
  draft.trailerLicensesByCategory = Object.fromEntries(
    Object.entries(config.trailerLicensesByCategory).map(([key, value]) => [key, [...value]]))
}, { immediate: true, deep: true })

const saving = ref(false)
const saved = ref(false)
const confirmingReset = ref(false)

// ── Request vehicle types ──

const newType = reactive({ id: '', label: '' })

function addType() {
  const id = newType.id.trim()
  if (!id || draft.requestVehicleTypes.some(type => type.id === id)) return
  const label = newType.label.trim()
  draft.requestVehicleTypes.push(label ? { id, label } : { id })
  newType.id = ''
  newType.label = ''
}

function removeType(index) {
  draft.requestVehicleTypes.splice(index, 1)
}

function moveType(index, direction) {
  const target = index + direction
  if (target < 0 || target >= draft.requestVehicleTypes.length) return
  const list = draft.requestVehicleTypes
  ;[list[index], list[target]] = [list[target], list[index]]
}

function typeLabel(type) {
  return store.requestTypeLabel(type, t)
}

// ── Licences ──

const newLicense = ref('')

function addLicense() {
  const code = newLicense.value.trim()
  if (!code || draft.licenses.includes(code)) return
  draft.licenses.push(code)
  newLicense.value = ''
}

function removeLicense(code) {
  draft.licenses = draft.licenses.filter(item => item !== code)
  // A licence that no longer exists cannot stay in the matrix.
  for (const matrix of [draft.licensesByCategory, draft.trailerLicensesByCategory]) {
    for (const category of Object.keys(matrix)) {
      matrix[category] = matrix[category].filter(item => item !== code)
    }
  }
}

// ── Licence matrix ──

function toggleMatrix(matrix, category, code) {
  const codes = matrix[category]
  matrix[category] = codes.includes(code)
    ? codes.filter(item => item !== code)
    : [...codes, code]
}

const canSave = computed(() =>
  draft.requestVehicleTypes.length > 0 && draft.licenses.length > 0
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  saved.value = false
  try {
    saved.value = await store.save({
      requestVehicleTypes: draft.requestVehicleTypes,
      licenses: draft.licenses,
      licensesByCategory: draft.licensesByCategory,
      trailerLicensesByCategory: draft.trailerLicensesByCategory,
    })
  } finally {
    saving.value = false
  }
}

async function reset() {
  confirmingReset.value = false
  saved.value = await store.reset()
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('config.title') }}</h1>
    <p class="text-sm text-stone-500 -mt-4 mb-6">{{ $t('config.intro') }}</p>

    <!-- Request vehicle types -->
    <section class="card mb-6">
      <h2 class="section-title mb-1">{{ $t('config.requestTypes') }}</h2>
      <p class="text-xs text-stone-400 mb-4">{{ $t('config.requestTypesHint') }}</p>

      <ul class="space-y-2 mb-4">
        <li v-for="(type, index) in draft.requestVehicleTypes" :key="type.id"
          class="flex items-center gap-2 p-2 border border-stone-200 rounded-lg">
          <span class="flex-1 min-w-0">
            <span class="font-medium text-stone-800">{{ typeLabel(type) }}</span>
            <span class="ml-2 text-xs text-stone-400 font-mono">{{ type.id }}</span>
            <span class="ml-2 badge-gray">
              {{ isBuiltInRequestType(type.id) ? $t('config.builtIn') : $t('config.custom') }}
            </span>
          </span>
          <button type="button" @click="moveType(index, -1)" :disabled="index === 0"
            :aria-label="$t('config.moveUp')" class="icon-btn min-w-[36px] disabled:opacity-30">↑</button>
          <button type="button" @click="moveType(index, 1)"
            :disabled="index === draft.requestVehicleTypes.length - 1"
            :aria-label="$t('config.moveDown')" class="icon-btn min-w-[36px] disabled:opacity-30">↓</button>
          <button type="button" @click="removeType(index)" :aria-label="$t('actions.delete')"
            class="icon-btn min-w-[36px] text-red-400 hover:text-red-600">✕</button>
        </li>
      </ul>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label class="label" for="new-type-id">
            {{ $t('config.identifier') }}
            <span class="font-normal text-stone-400">({{ $t('config.identifierHint') }})</span>
          </label>
          <input id="new-type-id" v-model="newType.id" class="input" placeholder="minibus" />
        </div>
        <div>
          <label class="label" for="new-type-label">{{ $t('config.labelOptional') }}</label>
          <input id="new-type-label" v-model="newType.label" class="input" placeholder="Minibus 20 places" />
        </div>
        <button type="button" @click="addType" class="btn-secondary justify-center">
          {{ $t('config.addType') }}
        </button>
      </div>
    </section>

    <!-- Licences -->
    <section class="card mb-6">
      <h2 class="section-title mb-1">{{ $t('config.licenses') }}</h2>
      <p class="text-xs text-stone-400 mb-4">{{ $t('config.licensesHint') }}</p>

      <div class="flex flex-wrap gap-2 mb-4">
        <span v-for="code in draft.licenses" :key="code"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-stone-300 text-sm font-medium">
          {{ code }}
          <button type="button" @click="removeLicense(code)"
            :aria-label="`${$t('actions.delete')} ${code}`"
            class="text-red-400 hover:text-red-600 inline-flex items-center justify-center min-w-[36px] min-h-[36px] -my-2 -mr-2 rounded">✕</button>
        </span>
      </div>

      <div class="flex gap-3 items-end max-w-md">
        <div class="flex-1">
          <label class="label" for="new-license">{{ $t('config.addLicense') }}</label>
          <input id="new-license" v-model="newLicense" class="input" placeholder="940" />
        </div>
        <button type="button" @click="addLicense" class="btn-secondary">{{ $t('actions.add') }}</button>
      </div>
    </section>

    <!-- Licence matrix -->
    <section class="card mb-6">
      <h2 class="section-title mb-1">{{ $t('config.matrix') }}</h2>
      <p class="text-xs text-stone-400 mb-1">{{ $t('config.matrixHint') }}</p>
      <p class="text-xs text-stone-400 mb-4 italic">{{ $t('config.categoriesFixed') }}</p>

      <div v-for="(matrix, key) in { licensesByCategory: draft.licensesByCategory, trailerLicensesByCategory: draft.trailerLicensesByCategory }"
        :key="key" class="mb-5 last:mb-0">
        <h3 class="text-sm font-semibold text-stone-700 mb-2">
          {{ key === 'licensesByCategory' ? $t('config.withoutTrailer') : $t('config.withTrailer') }}
        </h3>
        <div class="overflow-x-auto">
          <table class="text-sm">
            <thead>
              <tr>
                <th class="text-left font-medium text-stone-500 pr-4 pb-2">{{ $t('vehicles.category') }}</th>
                <th v-for="code in draft.licenses" :key="code"
                  class="px-2 pb-2 font-mono text-xs text-stone-500">{{ code }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in VEHICLE_CATEGORIES" :key="category" class="border-t border-stone-100">
                <td class="pr-4 py-1.5 text-stone-700">{{ $t(`vehicles.categories.${category}`) }}</td>
                <td v-for="code in draft.licenses" :key="code" class="px-1 py-0.5 text-center">
                  <!-- The label carries the tap area; the box stays small. -->
                  <label class="flex items-center justify-center min-w-[36px] min-h-[36px] cursor-pointer rounded hover:bg-stone-50">
                    <input type="checkbox"
                      :checked="matrix[category]?.includes(code)"
                      @change="toggleMatrix(matrix, category, code)"
                      :aria-label="`${$t(`vehicles.categories.${category}`)} — ${code}`"
                      class="w-4 h-4 rounded border-stone-300 text-olive-600 focus:ring-olive-500" />
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div class="flex items-center justify-between gap-3 flex-wrap">
      <button type="button" @click="confirmingReset = true" class="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
        {{ $t('config.reset') }}
      </button>
      <div class="flex items-center gap-3">
        <span v-if="saved" class="text-sm text-green-600" role="status">{{ $t('config.saved') }}</span>
        <button type="button" @click="save" class="btn-primary" :disabled="saving || !canSave">
          {{ $t('config.save') }}
        </button>
      </div>
    </div>

    <ConfirmModal v-if="confirmingReset"
      :title="$t('config.reset')"
      :message="$t('config.resetConfirm')"
      @confirm="reset"
      @cancel="confirmingReset = false" />
  </div>
</template>
