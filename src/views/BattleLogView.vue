<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClock } from '../stores/clock.js'
import { api } from '../api.js'
import { useAuthStore } from '../stores/auth.js'
import { useRouter } from 'vue-router'
import { journalCsv } from '../journal-export.js'
import BaseModal from '../components/common/BaseModal.vue'
import { parseLocal, addDays, elapsedSince } from '../datetime.js'
import { formatLongDate, formatClock } from '../i18n/formats.js'
import { localeTag } from '../i18n/index.js'
import { filterBySearch } from '../search.js'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'

const { t, te, locale } = useI18n()
const { todayString: today, nowString } = useClock()

const auth = useAuthStore()
const router = useRouter()
const journal = ref({ entries: [], archives: [] })
const journalVersion = ref('')
const selectedArchive = ref('')
const loading = ref(true)
const error = ref('')
const archiveOpen = ref(false)
const archiveName = ref('')
const archiving = ref(false)
const archive = computed(() => journal.value.archives.find(item => item.id === selectedArchive.value))
const movements = computed(() => [...(archive.value?.entries ?? journal.value.entries)]
  .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || (b.sequence ?? 0) - (a.sequence ?? 0)))

function errorText(err) { return err.code ? t(`server.${err.code}`, err.params) : t('errors.loadFailed', { entity: t('log.title'), reason: err.message }) }
async function loadJournal() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.journal()
    journal.value = result.data
    journalVersion.value = result.version
  } catch (err) { error.value = errorText(err) }
  finally { loading.value = false }
}
onMounted(loadJournal)
watch(selectedArchive, () => { search.value = ''; outstandingOnly.value = false })

async function archiveJournal() {
  if (archiving.value) return
  archiving.value = true
  error.value = ''
  try {
    await api.archiveJournal(archiveName.value, journalVersion.value)
    archiveOpen.value = false
    archiveName.value = ''
    selectedArchive.value = ''
    await loadJournal()
  } catch (err) { error.value = errorText(err) }
  finally { archiving.value = false }
}
function downloadCsv() {
  const url = URL.createObjectURL(new Blob([journalCsv(movements.value, t)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `journal-${(archive.value?.name ?? t('log.current')).replace(/[^\p{L}\p{N}_-]+/gu, '-')}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function printJournal() {
  router.push({ path: '/print', query: { doc: 'journal', archive: selectedArchive.value || undefined } })
}

const search = ref('')
const tag = computed(() => localeTag(locale.value))

/** Only the movements whose key never came back. */
const outstandingOnly = ref(false)

/** A movement that opened a holding nobody has closed. */
function stillOut(entry) {
  return entry.action !== 'returned' && !entry.closedBy
}

function elapsedLabel(at) {
  const { unit, value } = elapsedSince(at, nowString.value)
  return t(`log.elapsed.${unit}`, value, { count: value })
}

/**
 * The column names the model — a Duro is not a Class G, and that is what
 * people picture. The category stays searchable, since somebody may well
 * look for every heavy vehicle at once.
 */
function categoryLabel(category) {
  const key = `vehicles.categories.${category}`
  return category && te(key) ? t(key) : ''
}

/**
 * Who the key went to. A transfer names the person it was taken from as
 * well, since that is the movement.
 */
function holderLabel(entry) {
  if (entry.action === 'transferred' && entry.from) {
    return t('log.fromTo', { from: entry.from, to: entry.name })
  }
  return entry.name
}

const rows = computed(() =>
  filterBySearch(movements.value, search.value, entry => [
    entry.vehiclePlate, entry.vehicleName, categoryLabel(entry.vehicleCategory),
    entry.name, entry.from, entry.recordedBy,
    t(`log.actions.${entry.action}`),
  ]).filter(entry => !outstandingOnly.value || stillOut(entry)).map(entry => ({
    ...entry,
    day: (entry.at ?? '').slice(0, 10),
    stillOut: stillOut(entry),
    time: entry.at?.includes('T') ? formatClock(parseLocal(entry.at), tag.value).slice(0, 5) : '',
    model: entry.vehicleName || '—',
    holder: holderLabel(entry),
  }))
)

/** Reads as a date column, with the two days people actually ask about named. */
function dayLabel(date) {
  if (!date) return '—'
  if (date === today.value) return t('log.today')
  if (date === addDays(today.value, -1)) return t('log.yesterday')
  return formatLongDate(parseLocal(date), tag.value)
}

/**
 * The two ends of one holding. A return points back at the movement that
 * handed the key over, and that movement points forward at the return, so
 * the log can be read from either end.
 */
const byId = computed(() => new Map(movements.value.map(entry => [entry.id, entry])))

/** Counted on the whole fleet, not on what the filters leave visible. */
const outstandingCount = computed(() =>
  movements.value.filter(stillOut).length
)

const highlighted = ref('')
let clearHighlight = null

function counterpart(entry, id) {
  const target = id ? byId.value.get(id) : null
  return target ? { id: target.id, action: target.action } : null
}

function linksOf(entry) {
  return [counterpart(entry, entry.closes), counterpart(entry, entry.closedBy)].filter(Boolean)
}

async function goTo(id) {
  // The counterpart may be hidden by the current search: showing everything
  // again is the only way the link can keep its promise.
  if (search.value) search.value = ''
  await nextTick()
  document.getElementById(`movement-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  highlighted.value = id
  clearTimeout(clearHighlight)
  clearHighlight = setTimeout(() => { highlighted.value = '' }, 3000)
}

const ACTION_COLOR = {
  taken: 'bg-amber-100 text-amber-800',
  transferred: 'bg-sky-100 text-sky-800',
  returned: 'bg-green-100 text-green-800',
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('log.title') }}</h1>
    <p class="-mt-2 mb-4 text-sm text-stone-500">{{ $t('log.subtitle') }}</p>

    <p v-if="error" role="alert" class="mb-4 text-red-700">{{ error }}</p>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <label class="text-sm">{{ $t('log.journalLabel') }}
        <select v-model="selectedArchive" class="ml-2 border rounded px-3 py-2">
          <option value="">{{ $t('log.current') }}</option>
          <option v-for="item in [...journal.archives].reverse()" :key="item.id" :value="item.id">{{ item.name }} · {{ item.archivedAt.replace('T', ' ') }}</option>
        </select>
      </label>
      <button class="btn-secondary" :disabled="loading || archiving" @click="loadJournal">{{ $t('log.refresh') }}</button>
      <button class="btn-secondary" :disabled="loading || Boolean(error) || !movements.length" @click="downloadCsv">{{ $t('log.exportCsv') }}</button>
      <button class="btn-secondary" :disabled="loading || Boolean(error) || !movements.length" @click="printJournal">{{ $t('printing.print') }}</button>
      <button v-if="auth.isAdmin && !selectedArchive" class="btn-primary" :disabled="loading || Boolean(error) || !movements.length" @click="archiveOpen = true">{{ $t('log.archive') }}</button>
    </div>
    <p v-if="archive" class="mb-4 text-sm text-stone-500">{{ $t('log.archivedBy', { name: archive.archivedBy, date: archive.archivedAt.replace('T', ' ') }) }}</p>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <SearchField v-model="search" class="max-w-md flex-1 min-w-[12rem]" :placeholder="$t('log.searchPlaceholder')" />
      <button type="button" @click="outstandingOnly = !outstandingOnly"
        :class="['btn-action', outstandingOnly ? 'border-amber-400 bg-amber-50 text-amber-800' : '']">
        {{ $t('log.outstandingOnly') }}
        <span class="font-mono text-xs">{{ outstandingCount }}</span>
      </button>
    </div>

    <div v-if="rows.length" class="overflow-x-auto">
      <table class="w-full text-sm bg-white border border-stone-200 rounded-md">
        <thead>
          <tr class="border-b border-stone-200 text-left">
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 whitespace-nowrap">
              {{ $t('log.columns.when') }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {{ $t('log.columns.plate') }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {{ $t('log.columns.model') }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {{ $t('log.columns.movement') }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {{ $t('log.columns.holder') }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {{ $t('log.columns.recordedBy') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in rows" :key="entry.id" :id="`movement-${entry.id}`"
            :class="['border-b border-stone-100 last:border-0 align-top transition-colors',
              highlighted === entry.id ? 'bg-olive-50' : '']">
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="text-stone-800">{{ dayLabel(entry.day) }}</span>
              <span class="ml-1.5 font-mono text-stone-500">{{ entry.time }}</span>
            </td>
            <td class="px-3 py-2 plate whitespace-nowrap">{{ entry.vehiclePlate }}</td>
            <td class="px-3 py-2 text-stone-600 whitespace-nowrap">{{ entry.model }}</td>
            <td class="px-3 py-2">
              <span :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide',
                ACTION_COLOR[entry.action] ?? 'bg-stone-100 text-stone-700']">
                {{ $t(`log.actions.${entry.action}`) }}
              </span>
              <span v-for="link in linksOf(entry)" :key="link.id" class="block">
                <button type="button" @click="goTo(link.id)"
                  class="mt-1 text-xs text-olive-700 hover:text-olive-900 underline underline-offset-2 whitespace-nowrap">
                  {{ $t('log.seeAction', { action: $t(`log.actions.${link.action}`) }) }}
                </button>
              </span>
            </td>
            <td class="px-3 py-2 text-stone-800">
              {{ entry.holder }}
              <span v-if="entry.stillOut"
                class="ml-1.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">
                {{ $t('log.notReturned') }} · {{ elapsedLabel(entry.at) }}
              </span>
            </td>
            <td class="px-3 py-2 text-stone-500">{{ entry.recordedBy || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ListPlaceholder v-else
      :loading="loading"
      :message="search ? $t('common.noMatch', { query: search }) : $t('log.empty')" />
    <BaseModal v-if="archiveOpen" :title="$t('log.archive')" @close="!archiving && (archiveOpen = false)">
      <form @submit.prevent="archiveJournal">
        <p class="mb-4 text-sm text-stone-600">{{ $t('log.archiveConfirm') }}</p>
        <label class="block text-sm">{{ $t('log.archiveName') }}
          <input v-model="archiveName" required maxlength="120" class="mt-2 w-full border rounded px-3 py-2" :disabled="archiving" />
        </label>
        <p v-if="error" role="alert" class="mt-3 text-red-700">{{ error }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button type="button" class="btn-secondary" :disabled="archiving" @click="archiveOpen = false">{{ $t('actions.cancel') }}</button>
          <button class="btn-primary" :disabled="archiving || !archiveName.trim()">{{ $t('log.archive') }}</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
