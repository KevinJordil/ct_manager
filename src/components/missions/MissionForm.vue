<script setup>
import { reactive, ref, computed, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { usePersonsStore, isEnCongePendant } from '../../stores/persons.js'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { useMissionsStore } from '../../stores/missions.js'
import { getMissionStatut } from '../../utils.js'

const props = defineProps({ mission: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const personsStore = usePersonsStore()
const vehiclesStore = useVehiclesStore()
const missionsStore = useMissionsStore()

// Permis requis par catégorie de véhicule (sans remorque)
const PERMIS_PAR_CATEGORIE = {
  'léger-route': ['921', '921E', '920', '920E', '931', '931E', '930', '930E'],
  'léger-tt':    ['920', '920E', '931', '931E', '930', '930E'],
  'moyen':       ['931', '931E', '930', '930E'],
  'lourd':       ['930', '930E'],
}

// Permis requis si une remorque est demandée (uniquement les "E")
const PERMIS_REMORQUE_PAR_CATEGORIE = {
  'léger-route': ['921E', '920E', '931E', '930E'],
  'léger-tt':    ['920E', '931E', '930E'],
  'moyen':       ['931E', '930E'],
  'lourd':       ['930E'],
}

const form = reactive({ titre: '', description: '', dateDebut: '', dateFin: '', notes: '' })
const vehiculesForm = ref([])
const personnesForm = ref([])

watch(() => props.mission, (m) => {
  if (m) {
    form.titre = m.titre; form.description = m.description
    form.dateDebut = m.dateDebut; form.dateFin = m.dateFin
    form.notes = m.notes
    vehiculesForm.value = (m.vehicules ?? []).map(v => ({
      tempId: Math.random(), vehiculeId: v.vehiculeId, chauffeurId: v.chauffeurId ?? null,
      avecRemorque: v.avecRemorque ?? false,
    }))
    personnesForm.value = [...(m.personnes ?? [])]
  } else {
    form.titre = ''; form.description = ''; form.dateDebut = ''; form.dateFin = ''
    form.notes = ''
    vehiculesForm.value = []; personnesForm.value = []
  }
}, { immediate: true })

// ── Disponibilité ──

function personneOk(p, excludePersonId = null) {
  if (p.id === excludePersonId) return true
  if (p.indisponible) return false
  if (form.dateDebut && form.dateFin) {
    if (isEnCongePendant(p, form.dateDebut, form.dateFin)) return false
    return !missionsStore.missions.some(m => {
      if (m.id === props.mission?.id || getMissionStatut(m) === 'terminée') return false
      if (m.dateDebut > form.dateFin || m.dateFin < form.dateDebut) return false
      return m.vehicules?.some(v => v.chauffeurId === p.id) || m.personnes?.includes(p.id)
    })
  }
  const s = p.conges?.some(c => {
    const now = new Date().toISOString().slice(0, 16)
    return c.dateDebut <= now && now <= c.dateFin
  })
  return !s
}

function vehiculeOk(v, excludeVehiculeId = null) {
  if (v.id === excludeVehiculeId) return true
  if (v.statut === 'en prêt') return false
  if (form.dateDebut && form.dateFin) {
    return !missionsStore.missions.some(m => {
      if (m.id === props.mission?.id || getMissionStatut(m) === 'terminée') return false
      if (m.dateDebut > form.dateFin || m.dateFin < form.dateDebut) return false
      return m.vehicules?.some(mv => mv.vehiculeId === v.id)
    })
  }
  return true
}

function occupeesExceptRow(excludeTempId) {
  return new Set([
    ...vehiculesForm.value.filter(r => r.tempId !== excludeTempId).map(r => r.chauffeurId).filter(Boolean),
    ...personnesForm.value,
  ])
}

function occupeesExceptIdx(excludeIdx) {
  return new Set([
    ...vehiculesForm.value.map(r => r.chauffeurId).filter(Boolean),
    ...personnesForm.value.filter((_, i) => i !== excludeIdx),
  ])
}

function vehiculesDispoForRow(row) {
  const autresIds = new Set(vehiculesForm.value.filter(r => r.tempId !== row.tempId).map(r => r.vehiculeId).filter(Boolean))
  return vehiclesStore.vehicles.filter(v => {
    if (autresIds.has(v.id)) return false
    return vehiculeOk(v, row.vehiculeId)
  })
}

function chauffeursDispoForRow(row) {
  const vehicule = vehiclesStore.vehicles.find(v => v.id === row.vehiculeId)
  const permisRequis = vehicule
    ? (row.avecRemorque ? PERMIS_REMORQUE_PAR_CATEGORIE[vehicule.categorie] : PERMIS_PAR_CATEGORIE[vehicule.categorie])
    : null
  const occupees = occupeesExceptRow(row.tempId)
  return personsStore.persons.filter(p => {
    if (p.id !== row.chauffeurId && occupees.has(p.id)) return false
    if (!personneOk(p, row.chauffeurId)) return false
    if (permisRequis && !p.permis.some(perm => permisRequis.includes(perm))) return false
    return true
  })
}

function personnelDispoForIdx(idx) {
  const occupees = occupeesExceptIdx(idx)
  return personsStore.persons.filter(p => {
    if (p.id !== personnesForm.value[idx] && occupees.has(p.id)) return false
    return personneOk(p, personnesForm.value[idx])
  })
}

function permisRequisPourRow(row) {
  const v = vehiclesStore.vehicles.find(v => v.id === row.vehiculeId)
  if (!v) return null
  return row.avecRemorque
    ? PERMIS_REMORQUE_PAR_CATEGORIE[v.categorie]
    : PERMIS_PAR_CATEGORIE[v.categorie]
}

// ── Mutations sur les listes ──

function addVehicule() { vehiculesForm.value.push({ tempId: Math.random(), vehiculeId: '', chauffeurId: null, avecRemorque: false }) }
function removeVehicule(tid) { vehiculesForm.value = vehiculesForm.value.filter(r => r.tempId !== tid) }
function onVehiculeChange(row) {
  row.avecRemorque = false
  if (!row.chauffeurId) return
  if (!chauffeursDispoForRow(row).find(p => p.id === row.chauffeurId)) row.chauffeurId = null
}
function onRemorqueChange(row) {
  if (!row.chauffeurId) return
  if (!chauffeursDispoForRow(row).find(p => p.id === row.chauffeurId)) row.chauffeurId = null
}
function addPersonnel() { personnesForm.value.push('') }
function removePersonnel(idx) { personnesForm.value.splice(idx, 1) }

watch([() => form.dateDebut, () => form.dateFin], () => {
  if (!form.dateDebut || !form.dateFin) return
  vehiculesForm.value.forEach(row => {
    if (!row.chauffeurId) return
    const p = personsStore.persons.find(p => p.id === row.chauffeurId)
    if (!p || !personneOk(p, row.chauffeurId)) row.chauffeurId = null
  })
  personnesForm.value = personnesForm.value.filter(id => {
    const p = personsStore.persons.find(p => p.id === id)
    return p && personneOk(p, id)
  })
})

// ── Capacité totale ──

const statsCapacite = computed(() => {
  const selectionnes = vehiculesForm.value.filter(r => r.vehiculeId)
  const places = selectionnes.reduce((sum, r) => {
    const v = vehiclesStore.vehicles.find(v => v.id === r.vehiculeId)
    return sum + (v?.places ?? 0)
  }, 0)
  const conducteurs = selectionnes.filter(r => r.chauffeurId).length
  return { places, conducteurs }
})

function submit() {
  if (!form.titre.trim() || !form.dateDebut || !form.dateFin) return
  emit('save', {
    ...form,
    vehicules: vehiculesForm.value.filter(r => r.vehiculeId).map(r => ({
      id: String(r.tempId), vehiculeId: r.vehiculeId, chauffeurId: r.chauffeurId || null,
      avecRemorque: r.avecRemorque ?? false,
    })),
    personnes: personnesForm.value.filter(Boolean),
  })
}
</script>

<template>
  <BaseModal :title="mission ? 'Modifier la mission' : 'Nouvelle mission'" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-5">

      <div class="space-y-3">
        <div>
          <label class="label">Titre *</label>
          <input v-model="form.titre" class="input" placeholder="Titre de la mission" required />
        </div>
        <div>
          <label class="label">Description</label>
          <textarea v-model="form.description" class="input" rows="2" placeholder="Description..." />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Début *</label>
            <input v-model="form.dateDebut" type="datetime-local" class="input" required />
          </div>
          <div>
            <label class="label">Fin *</label>
            <input v-model="form.dateFin" type="datetime-local" class="input" :min="form.dateDebut" required />
          </div>
        </div>
      </div>

      <!-- Véhicules -->
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-700">Véhicules engagés</h3>
            <span v-if="statsCapacite.places > 0 || statsCapacite.conducteurs > 0"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {{ statsCapacite.places }} places
              <span class="text-blue-400">+</span>
              {{ statsCapacite.conducteurs }} conducteur{{ statsCapacite.conducteurs !== 1 ? 's' : '' }}
            </span>
          </div>
          <button type="button" @click="addVehicule"
            class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Ajouter
          </button>
        </div>
        <div v-if="vehiculesForm.length" class="divide-y divide-gray-100">
          <div v-for="row in vehiculesForm" :key="row.tempId" class="p-3 space-y-2">
            <div class="flex gap-2 items-start">
              <select v-model="row.vehiculeId" @change="onVehiculeChange(row)" class="input text-sm flex-1">
                <option value="">— Sélectionner un véhicule —</option>
                <option v-for="v in vehiculesDispoForRow(row)" :key="v.id" :value="v.id">
                  {{ v.nom }} {{ v.immatriculation }}{{ v.places ? ` — ${v.places} places` : '' }}
                </option>
              </select>
              <button type="button" @click="removeVehicule(row.tempId)" class="mt-1 icon-btn text-red-400 hover:text-red-600 shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div v-if="row.vehiculeId" class="space-y-2">
              <!-- Remorque -->
              <label class="flex items-center gap-2 cursor-pointer w-fit">
                <input type="checkbox" v-model="row.avecRemorque" @change="onRemorqueChange(row)"
                  class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm text-gray-700">Avec remorque</span>
                <span v-if="row.avecRemorque" class="text-xs text-blue-600 font-medium">(permis E requis)</span>
              </label>
              <!-- Chauffeur -->
              <select v-model="row.chauffeurId" class="input text-sm">
                <option :value="null">— Sans chauffeur —</option>
                <option v-for="p in chauffeursDispoForRow(row)" :key="p.id" :value="p.id">
                  {{ p.grade ? p.grade + ' ' : '' }}{{ p.prenom }} {{ p.nom }} ({{ p.permis.join(', ') }})
                </option>
              </select>
              <p v-if="permisRequisPourRow(row)" class="text-xs text-gray-400">
                Permis requis : {{ permisRequisPourRow(row).join(', ') }}
              </p>
              <p v-if="form.dateDebut && form.dateFin && chauffeursDispoForRow(row).length === 0"
                class="text-xs text-orange-600">Aucun chauffeur qualifié disponible sur ces dates</p>
            </div>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-gray-400 italic text-center">Aucun véhicule ajouté</p>
      </div>

      <!-- Personnel libre -->
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700">Personnel sans véhicule</h3>
          <button type="button" @click="addPersonnel"
            class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Ajouter
          </button>
        </div>
        <div v-if="personnesForm.length" class="divide-y divide-gray-100">
          <div v-for="(pid, idx) in personnesForm" :key="idx" class="flex gap-2 items-center p-3">
            <select v-model="personnesForm[idx]" class="input text-sm flex-1">
              <option value="">— Sélectionner une personne —</option>
              <option v-for="p in personnelDispoForIdx(idx)" :key="p.id" :value="p.id">
                {{ p.grade ? p.grade + ' ' : '' }}{{ p.prenom }} {{ p.nom }}
              </option>
            </select>
            <button type="button" @click="removePersonnel(idx)" class="icon-btn text-red-400 hover:text-red-600 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-gray-400 italic text-center">Aucune personne ajoutée</p>
      </div>

      <div>
        <label class="label">Notes</label>
        <textarea v-model="form.notes" class="input" rows="2" placeholder="Notes..." />
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <button type="button" @click="$emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">{{ mission ? 'Enregistrer' : 'Créer' }}</button>
      </div>
    </form>
  </BaseModal>
</template>
