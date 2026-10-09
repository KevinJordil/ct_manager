<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { usePersonsStore } from '../stores/persons.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { useTrailersStore } from '../stores/trailers.js'
import { useRequestsStore } from '../stores/requests.js'
import { useConfigStore } from '../stores/config.js'
import { useClock } from '../stores/clock.js'
import { buildTables, tableCsv, zip } from '../export.js'

/**
 * Everything the course produced, to keep once the application is switched
 * off: one spreadsheet per table in a ZIP, and the same tables as a report
 * to print or save as PDF.
 */
const { t } = useI18n()
const router = useRouter()
const { nowString, todayString } = useClock()
const stores = {
  persons: usePersonsStore(), vehicles: useVehiclesStore(), missions: useMissionsStore(),
  trailers: useTrailersStore(), requests: useRequestsStore(), config: useConfigStore(),
}

const journal = ref(null)
const ready = ref(false)
const journalMissing = ref(false)

onMounted(async () => {
  await Promise.all(Object.values(stores).map(store => store.init()))
  try {
    journal.value = (await api.journal()).data
  } catch {
    journalMissing.value = true
  }
  ready.value = true
})

const tables = computed(() => buildTables({
  persons: stores.persons.persons, vehicles: stores.vehicles.vehicles, trailers: stores.trailers.trailers,
  missions: stores.missions.missions, requests: stores.requests.requests, journal: journal.value,
  now: nowString.value, t,
  vehicleTypeLabel: stores.config.vehicleTypeLabel,
  requestTypeLabel: type => stores.config.requestTypeLabel(type, t),
}))

function download() {
  const files = tables.value.map((table, index) => ({
    name: `${String(index + 1).padStart(2, '0')}-${table.key}.csv`,
    content: tableCsv(table),
  }))
  const url = URL.createObjectURL(new Blob([zip(files)], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `export-ct-${todayString.value}.zip`
  link.click()
  URL.revokeObjectURL(url)
}

function openReport() {
  router.push({ path: '/print', query: { doc: 'report' } })
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('export.title') }}</h1>
    <p class="text-sm text-stone-600 -mt-4 mb-6 max-w-2xl">{{ $t('export.intro') }}</p>

    <div v-if="!ready" class="text-stone-500">{{ $t('common.loading') }}</div>
    <template v-else>
      <p v-if="journalMissing" role="alert" class="mb-4 text-sm text-red-700">{{ $t('export.journalMissing') }}</p>

      <section class="card mb-6">
        <h2 class="section-title mb-3">{{ $t('export.contents') }}</h2>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <li v-for="table in tables" :key="table.key" class="flex justify-between border-b border-stone-100 py-1">
            <span>{{ table.title }}</span>
            <span class="tabular-nums text-stone-600">{{ table.rows.length }}</span>
          </li>
        </ul>
      </section>

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn-primary" @click="download">{{ $t('export.downloadZip') }}</button>
        <button type="button" class="btn-secondary" @click="openReport">{{ $t('export.openReport') }}</button>
      </div>
      <p class="mt-3 text-xs text-stone-500 max-w-2xl">{{ $t('export.sensitive') }}</p>
    </template>
  </div>
</template>
