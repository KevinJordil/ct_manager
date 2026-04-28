import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api.js'
import { addTimeIfMissing } from '../utils.js'

// ── Migration des données existantes ──

function migrate(data) {
  return data.map(m => {
    let mission = { ...m }
    // Ancien format : vehiculeId/chauffeurId → vehicules[]
    if (mission.vehicules === undefined) {
      const vehicules = mission.vehiculeId
        ? [{ id: `mig-${mission.id}`, vehiculeId: mission.vehiculeId, chauffeurId: mission.chauffeurId || null, avecRemorque: false }]
        : []
      const { vehiculeId: _v, chauffeurId: _c, ...rest } = mission
      mission = { ...rest, vehicules, personnes: mission.personnes ?? [] }
    }
    // Supprimer le statut stocké (calculé dynamiquement)
    const { statut: _s, ...rest } = mission
    // Ajouter avecRemorque si absent sur les entrées véhicules
    const vehicules = (rest.vehicules ?? []).map(v => ({
      ...v,
      avecRemorque: v.avecRemorque ?? false,
    }))
    // Dates sans heure → ajouter heure par défaut
    return {
      ...rest,
      vehicules,
      dateDebut: addTimeIfMissing(mission.dateDebut, '08:00'),
      dateFin: addTimeIfMissing(mission.dateFin, '17:00'),
    }
  })
}

// ── Store ──

export const useMissionsStore = defineStore('missions', () => {
  const missions = ref([])
  let initPromise = null

  async function init() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const raw = await api.load('missions')
        missions.value = migrate(raw)
      } catch (err) {
        console.warn('[missions] server unavailable:', err.message)
      }
    })()
    return initPromise
  }

  function _save() { api.save('missions', missions.value) }

  function add(mission) {
    const { statut: _s, ...data } = mission
    missions.value.push({ ...data, id: Date.now().toString() })
    _save()
  }

  function update(id, data) {
    const { statut: _s, ...rest } = data
    const idx = missions.value.findIndex(m => m.id === id)
    if (idx !== -1) missions.value[idx] = { ...missions.value[idx], ...rest }
    _save()
  }

  function remove(id) {
    missions.value = missions.value.filter(m => m.id !== id)
    _save()
  }

  return { missions, init, add, update, remove }
})
