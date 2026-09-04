<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useClock } from '../stores/clock.js'
import { keyMovements } from '../keys.js'
import { parseLocal, addDays } from '../datetime.js'
import { formatLongDate, formatClock } from '../i18n/formats.js'
import { localeTag } from '../i18n/index.js'
import { filterBySearch } from '../search.js'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import SearchField from '../components/common/SearchField.vue'

const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const { t, te, locale } = useI18n()
const { todayString: today } = useClock()

onMounted(() => {
  vehiclesStore.init()
  personsStore.init()
})

const search = ref('')
const tag = computed(() => localeTag(locale.value))

/** A category the fleet no longer declares still has to print as something. */
function categoryLabel(category) {
  const key = `vehicles.categories.${category}`
  return category && te(key) ? t(key) : '—'
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
  filterBySearch(keyMovements(vehiclesStore.vehicles), search.value, entry => [
    entry.vehiclePlate, entry.vehicleName, categoryLabel(entry.vehicleCategory),
    entry.name, entry.from, entry.recordedBy,
    t(`log.actions.${entry.action}`),
  ]).map(entry => ({
    ...entry,
    day: (entry.at ?? '').slice(0, 10),
    time: entry.at?.includes('T') ? formatClock(parseLocal(entry.at), tag.value).slice(0, 5) : '',
    category: categoryLabel(entry.vehicleCategory),
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
const byId = computed(() => new Map(rows.value.map(entry => [entry.id, entry])))

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

    <SearchField v-model="search" class="mb-4 max-w-md" :placeholder="$t('log.searchPlaceholder')" />

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
              {{ $t('log.columns.type') }}
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
            <td class="px-3 py-2 text-stone-600 whitespace-nowrap">{{ entry.category }}</td>
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
            <td class="px-3 py-2 text-stone-800">{{ entry.holder }}</td>
            <td class="px-3 py-2 text-stone-500">{{ entry.recordedBy || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ListPlaceholder v-else
      :loading="!vehiclesStore.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('log.empty')" />
  </div>
</template>
