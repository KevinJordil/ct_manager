<script setup>
import { computed, onMounted } from 'vue'
import { usePersonsStore, getStatut, isEnCongePendant } from '../stores/persons.js'
import { formatDT, getMissionStatut } from '../utils.js'
import { useVehiclesStore } from '../stores/vehicles.js'
import { useMissionsStore } from '../stores/missions.js'
import StatusBadge from '../components/common/StatusBadge.vue'

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()

onMounted(() => {
  personsStore.init()
  vehiclesStore.init()
  missionsStore.init()
})

const stats = computed(() => {
  const vehiculesLibres = vehiclesStore.vehicles.filter(v => {
    if (v.statut === 'en prêt') return false
    return !missionsStore.missions.some(m =>
      getMissionStatut(m) === 'en cours' && m.vehicules?.some(mv => mv.vehiculeId === v.id)
    )
  }).length

  const vehiculesEnMission = vehiclesStore.vehicles.filter(v => {
    if (v.statut === 'en prêt') return false
    return missionsStore.missions.some(m =>
      getMissionStatut(m) === 'en cours' && m.vehicules?.some(mv => mv.vehiculeId === v.id)
    )
  }).length

  const missionsCours = missionsStore.missions.filter(m => getMissionStatut(m) === 'en cours')

  function estEnMission(p) {
    return missionsCours.some(m =>
      m.vehicules?.some(v => v.chauffeurId === p.id) || m.personnes?.includes(p.id)
    )
  }

  const personnesDisponibles = personsStore.persons.filter(p => getStatut(p) === 'disponible' && !estEnMission(p)).length
  const personnesEnMission   = personsStore.persons.filter(p => getStatut(p) === 'disponible' && estEnMission(p)).length
  const personnesIndisponibles = personsStore.persons.filter(p => getStatut(p) !== 'disponible').length

  return {
    personnesDisponibles,
    personnesEnMission,
    personnesIndisponibles,
    vehiculesLibres,
    vehiculesEnMission,
    vehiculesEnPret: vehiclesStore.vehicles.filter(v => v.statut === 'en prêt').length,
  }
})

const missionsEnCours = computed(() =>
  missionsStore.missions
    .filter(m => getMissionStatut(m) === 'en cours')
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
  missionsStore.missions.filter(m => getMissionStatut(m) === 'en cours').forEach(m => {
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
      <div v-if="missionsEnCours.length" class="space-y-3">
        <div v-for="m in missionsEnCours" :key="m.id" class="card">
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
      <p v-else class="text-gray-400 text-sm italic">Aucune mission en cours</p>
    </section>
  </div>
</template>
