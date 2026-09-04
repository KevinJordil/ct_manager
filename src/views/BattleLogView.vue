<script setup>
import { computed, onMounted, ref } from 'vue'
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
const { t, locale } = useI18n()
const { todayString: today } = useClock()

onMounted(() => {
  vehiclesStore.init()
  personsStore.init()
})

const search = ref('')

const movements = computed(() =>
  filterBySearch(keyMovements(vehiclesStore.vehicles), search.value, entry => [
    entry.vehicleName, entry.vehiclePlate, entry.name, entry.from, entry.recordedBy,
    t(`keys.log.${entry.action}`, { name: entry.name, from: entry.from }),
  ])
)

const tag = computed(() => localeTag(locale.value))

/** The day a movement belongs to, as a heading. */
function dayLabel(date) {
  if (!date) return t('log.undated')
  if (date === today.value) return t('log.today')
  if (date === addDays(today.value, -1)) return t('log.yesterday')
  return formatLongDate(parseLocal(date), tag.value)
}

/** Movements grouped by day, most recent day first. */
const days = computed(() => {
  const groups = []
  for (const entry of movements.value) {
    const date = (entry.at ?? '').slice(0, 10)
    const last = groups.at(-1)
    if (last?.date === date) last.entries.push(entry)
    else groups.push({ date, label: dayLabel(date), entries: [entry] })
  }
  return groups
})

const DOT = {
  taken: 'bg-amber-500',
  transferred: 'bg-sky-600',
  returned: 'bg-green-500',
}

function timeOf(at) {
  if (!at || !at.includes('T')) return ''
  return formatClock(parseLocal(at), tag.value).slice(0, 5)
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('log.title') }}</h1>
    <p class="-mt-2 mb-4 text-sm text-stone-500">{{ $t('log.subtitle') }}</p>

    <SearchField v-model="search" class="mb-4 max-w-md" :placeholder="$t('log.searchPlaceholder')" />

    <div v-if="days.length" class="space-y-6">
      <section v-for="day in days" :key="day.date">
        <h2 class="section-title">{{ day.label }}</h2>
        <ol class="space-y-2">
          <li v-for="entry in day.entries" :key="entry.id"
            class="card flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
            <span class="font-mono text-sm text-stone-500 tabular-nums">{{ timeOf(entry.at) }}</span>
            <span :class="['w-2 h-2 rounded-full shrink-0 self-center', DOT[entry.action] ?? 'bg-stone-400']" />
            <span class="plate">{{ entry.vehiclePlate }}</span>
            <span class="text-xs text-stone-400">{{ entry.vehicleName }}</span>
            <span class="text-stone-700">
              <template v-if="entry.action === 'returned'">
                {{ $t('keys.log.returned', { name: entry.name }) }}
              </template>
              <template v-else-if="entry.action === 'transferred'">
                {{ $t('keys.log.transferred', { from: entry.from, name: entry.name }) }}
              </template>
              <template v-else>
                {{ $t('keys.log.taken', { name: entry.name }) }}
              </template>
            </span>
            <span v-if="entry.byOther" class="text-xs text-stone-400">
              {{ $t('keys.recordedBy', { user: entry.recordedBy }) }}
            </span>
          </li>
        </ol>
      </section>
    </div>

    <ListPlaceholder v-else
      :loading="!vehiclesStore.loaded"
      :message="search ? $t('common.noMatch', { query: search }) : $t('log.empty')" />
  </div>
</template>
