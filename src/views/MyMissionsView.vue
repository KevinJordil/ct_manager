<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionsStore } from '../stores/missions.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { usePersonsStore } from '../stores/persons.js'
import { useAuthStore } from '../stores/auth.js'
import { useClock } from '../stores/clock.js'
import { missionsOfPerson } from '../assignments.js'
import { keysHeldBy } from '../keys.js'
import { formatDateTime } from '../datetime.js'
import { personName, vehiclePlate, vehicleModel } from '../labels.js'
import StatusBadge from '../components/common/StatusBadge.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const missionsStore = useMissionsStore()
const vehiclesStore = useVehiclesStore()
const personsStore = usePersonsStore()
const auth = useAuthStore()
const router = useRouter()
const { nowString } = useClock()

onMounted(() => {
  missionsStore.init()
  vehiclesStore.init()
  personsStore.init()
})

const me = computed(() =>
  auth.user?.personId
    ? personsStore.persons.find(person => person.id === auth.user.personId) ?? null
    : null
)

const groups = computed(() =>
  missionsOfPerson(missionsStore.missions, auth.user?.personId ?? '', nowString.value)
)

const sections = computed(() => [
  { key: 'ongoing', missions: groups.value.ongoing },
  { key: 'upcoming', missions: groups.value.upcoming },
  { key: 'past', missions: groups.value.past },
].filter(section => section.missions.length))

const total = computed(() =>
  groups.value.ongoing.length + groups.value.upcoming.length + groups.value.past.length
)

/** The keys this person is holding right now, whatever the planning says. */
const myKeys = computed(() =>
  auth.user?.personId ? keysHeldBy(auth.user.personId, vehiclesStore.vehicles) : []
)

const vehicleOf = id => vehiclesStore.vehicles.find(vehicle => vehicle.id === id) ?? null

/** Everybody else on the mission, so one knows who to look for. */
function othersOn(mission) {
  const ids = new Set([
    ...(mission.vehicles ?? []).map(entry => entry.driverId).filter(Boolean),
    ...(mission.staffIds ?? []),
  ])
  ids.delete(auth.user?.personId)
  return [...ids].map(id => personsStore.persons.find(person => person.id === id)).filter(Boolean)
}

/** Open by default while it matters: a running mission is read, not browsed. */
const expanded = ref(new Set())

function toggle(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function isOpen(mission) {
  return expanded.value.has(mission.id) || mission.status === 'ongoing'
}

function printOrder(mission) {
  router.push({ path: '/print', query: { doc: 'mission', id: mission.id } })
}
</script>

<template>
  <div>
    <h1 class="page-title mb-1">{{ $t('mine.title') }}</h1>
    <p class="mb-4 text-sm text-stone-500">
      {{ me ? $t('mine.subtitle', { name: personName(me) }) : $t('mine.noRecord') }}
    </p>

    <!-- A key in the pocket outranks any planning -->
    <div v-if="myKeys.length" class="card mb-6 border-amber-200 bg-amber-50">
      <p class="text-sm font-semibold text-amber-900">
        {{ $t('mine.keysHeld', myKeys.length, { count: myKeys.length }) }}
      </p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <RouterLink v-for="vehicle in myKeys" :key="vehicle.id" to="/vehicles"
          class="inline-flex items-baseline gap-1.5 text-sm bg-white border border-amber-200 rounded px-2 py-1 hover:border-amber-400">
          <span class="plate">{{ vehiclePlate(vehicle) }}</span>
          <span class="text-xs text-stone-500">{{ vehicleModel(vehicle) }}</span>
        </RouterLink>
      </div>
    </div>

    <div v-if="total" class="space-y-6">
      <section v-for="section in sections" :key="section.key">
        <h2 class="section-title">
          {{ $t(`mine.sections.${section.key}`) }}
          <span class="ml-1 font-mono">{{ section.missions.length }}</span>
        </h2>

        <div class="space-y-3">
          <article v-for="mission in section.missions" :key="mission.id" class="card">
            <button type="button" class="w-full text-left" @click="toggle(mission.id)">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold text-stone-900">{{ mission.title }}</p>
                  <p class="mt-0.5 text-sm text-stone-500">
                    {{ formatDateTime(mission.startDate) }} → {{ formatDateTime(mission.endDate) }}
                  </p>
                </div>
                <StatusBadge :status="mission.status" />
              </div>

              <!-- What this person does on it, in one line -->
              <p class="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                <template v-for="drive in mission.role.driving" :key="drive.vehicleId">
                  <span class="inline-flex items-baseline gap-1.5 rounded bg-olive-50 border border-olive-200 px-2 py-0.5">
                    <span class="text-xs text-olive-800">{{ $t('mine.asDriver') }}</span>
                    <span class="plate">{{ vehiclePlate(vehicleOf(drive.vehicleId)) }}</span>
                    <span class="text-xs text-stone-500">{{ vehicleModel(vehicleOf(drive.vehicleId)) }}</span>
                    <span v-if="drive.withTrailer" class="text-xs text-amber-700">{{ $t('missions.trailerBadge') }}</span>
                  </span>
                </template>
                <span v-if="mission.role.staff" class="badge-gray">{{ $t('mine.asStaff') }}</span>
              </p>
            </button>

            <div v-if="isOpen(mission)" class="mt-3 pt-3 border-t border-stone-100 space-y-2 text-sm">
              <p v-if="mission.description" class="text-stone-700">{{ mission.description }}</p>
              <p v-if="mission.notes" class="whitespace-pre-line text-stone-600">{{ mission.notes }}</p>

              <div v-if="othersOn(mission).length">
                <p class="text-xs uppercase tracking-wide text-stone-400 mb-1">{{ $t('mine.withYou') }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="person in othersOn(mission)" :key="person.id" class="badge-gray">
                    {{ personName(person) }}<span v-if="person.phone" class="ml-1 text-stone-500">{{ person.phone }}</span>
                  </span>
                </div>
              </div>

              <button type="button" class="btn-action" @click.stop="printOrder(mission)">
                {{ $t('printing.short') }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <ListPlaceholder v-else :loading="!missionsStore.loaded" :message="$t('mine.empty')" />
  </div>
</template>
