<script setup>
import { computed, onMounted } from 'vue'
import { usePersonsStore } from '../stores/persons.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import { useClock } from '../stores/clock.js'
import { formatDT } from '../datetime.js'
import {
  getPersonStatut, getVehiculeStatut, isEnCongePendant,
  missionEngagePersonne, missionsEnCours,
} from '../availability.js'
import StatusBadge from '../components/common/StatusBadge.vue'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()
const { nowStr } = useClock()

onMounted(() => {
  personsStore.init()
  vehiclesStore.init()
  missionsStore.init()
})

const enCours = computed(() => missionsEnCours(missionsStore.missions, nowStr.value))

/** Compte les éléments par statut, en une seule passe */
function compter(items, statutDe) {
  return items.reduce((acc, item) => {
    const s = statutDe(item)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
}

const stats = computed(() => {
  const now = nowStr.value

  const parVehicule = compter(vehiclesStore.vehicles, v =>
    getVehiculeStatut(v, missionsStore.missions, now)
  )

  const parPersonne = compter(personsStore.persons, p => {
    const base = getPersonStatut(p, now)
    if (base !== 'disponible') return 'indisponible'
    return enCours.value.some(m => missionEngagePersonne(m, p.id)) ? 'en mission' : 'disponible'
  })

  return {
    personnesDisponibles: parPersonne['disponible'] ?? 0,
    personnesEnMission: parPersonne['en mission'] ?? 0,
    personnesIndisponibles: parPersonne['indisponible'] ?? 0,
    vehiculesLibres: parVehicule['libre'] ?? 0,
    vehiculesEnMission: parVehicule['en mission'] ?? 0,
    vehiculesEnPret: parVehicule['en prêt'] ?? 0,
  }
})

const missionsDetaillees = computed(() =>
  enCours.value
    .map(m => ({
      ...m,
      vehiculesDetail: (m.vehicules ?? []).map(v => ({
        ...v,
        vehicule: vehiclesStore.vehicles.find(vv => vv.id === v.vehiculeId),
        chauffeur: v.chauffeurId ? personsStore.persons.find(p => p.id === v.chauffeurId) : null,
      })),
      personnelLibre: (m.personnes ?? [])
        .map(id => personsStore.persons.find(p => p.id === id))
        .filter(Boolean),
    }))
)

const alertes = computed(() => {
  const list = []
  enCours.value.forEach(m => {
    m.vehicules?.forEach(v => {
      if (!v.chauffeurId) return
      const chauffeur = personsStore.persons.find(p => p.id === v.chauffeurId)
      if (chauffeur && isEnCongePendant(chauffeur, m.dateDebut, m.dateFin)) {
        list.push(`Mission "${m.titre}" : ${chauffeur.prenom} ${chauffeur.nom} (chauffeur) est en congé pendant la mission`)
      }
    })
    m.personnes?.forEach(pid => {
      const p = personsStore.persons.find(p => p.id === pid)
      if (p && isEnCongePendant(p, m.dateDebut, m.dateFin)) {
        list.push(`Mission "${m.titre}" : ${p.prenom} ${p.nom} est en congé pendant la mission`)
      }
    })
    m.vehicules?.forEach(v => {
      const vehicule = vehiclesStore.vehicles.find(vv => vv.id === v.vehiculeId)
      if (vehicule?.statut === 'en prêt') {
        list.push(`Mission "${m.titre}" : le véhicule ${vehicule.nom} est marqué "en prêt"`)
      }
    })
  })
  return list
})
</script>

<template>
  <div>
    <h1 class="page-title">Tableau de bord</h1>

    <div v-if="alertes.length" class="mb-6 space-y-2">
      <div v-for="alerte in alertes" :key="alerte"
        class="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        {{ alerte }}
      </div>
    </div>

    <section class="mb-8">
      <h2 class="section-title">Personnes</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="stat-card stat-green">
          <p class="stat-value">{{ stats.personnesDisponibles }}</p>
          <p class="stat-label">Disponibles</p>
        </div>
        <div class="stat-card stat-orange">
          <p class="stat-value">{{ stats.personnesEnMission }}</p>
          <p class="stat-label">En mission</p>
        </div>
        <div class="stat-card stat-red">
          <p class="stat-value">{{ stats.personnesIndisponibles }}</p>
          <p class="stat-label">Indisponibles</p>
        </div>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="section-title">Véhicules</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="stat-card stat-green">
          <p class="stat-value">{{ stats.vehiculesLibres }}</p>
          <p class="stat-label">Libres</p>
        </div>
        <div class="stat-card stat-orange">
          <p class="stat-value">{{ stats.vehiculesEnMission }}</p>
          <p class="stat-label">En mission</p>
        </div>
        <div class="stat-card stat-red">
          <p class="stat-value">{{ stats.vehiculesEnPret }}</p>
          <p class="stat-label">En prêt</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Missions en cours</h2>
      <div v-if="missionsDetaillees.length" class="space-y-3">
        <div v-for="m in missionsDetaillees" :key="m.id" class="card">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-gray-900">{{ m.titre }}</p>
              <p class="text-sm text-gray-500 mt-0.5">{{ formatDT(m.dateDebut) }} → {{ formatDT(m.dateFin) }}</p>

              <div v-if="m.vehiculesDetail.length" class="mt-2 space-y-1">
                <div v-for="v in m.vehiculesDetail" :key="v.id" class="flex items-center gap-1.5 text-sm text-gray-600">
                  <span>🚗 {{ v.vehicule?.nom ?? '—' }}</span>
                  <template v-if="v.chauffeur">
                    <span class="text-gray-400">·</span>
                    <span>👤 {{ v.chauffeur.grade ? v.chauffeur.grade + ' ' : '' }}{{ v.chauffeur.prenom }} {{ v.chauffeur.nom }}</span>
                  </template>
                </div>
              </div>

              <div v-if="m.personnelLibre.length" class="mt-1.5 flex flex-wrap gap-1">
                <span v-for="p in m.personnelLibre" :key="p.id"
                  class="text-xs text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
                  👤 {{ p.grade ? p.grade + ' ' : '' }}{{ p.prenom }} {{ p.nom }}
                </span>
              </div>
            </div>
            <StatusBadge statut="en cours" />
          </div>
        </div>
      </div>
      <ListPlaceholder v-else :chargement="!missionsStore.chargee" message="Aucune mission en cours" />
    </section>
  </div>
</template>
