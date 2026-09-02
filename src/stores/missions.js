import { defineStore } from 'pinia'
import { addTimeIfMissing } from '../datetime.js'
import { useCollection } from './collection.js'

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

/** Le statut est toujours recalculé depuis les dates : on ne le persiste pas. */
function sansStatut(mission) {
  const { statut: _s, ...data } = mission
  return data
}

// ── Store ──

export const useMissionsStore = defineStore('missions', () => {
  const c = useCollection('missions', migrate)

  return {
    missions: c.items,
    chargement: c.chargement,
    chargee: c.chargee,
    init: c.init,
    recharger: c.recharger,
    add: mission => c.add(sansStatut(mission)),
    update: (id, data) => c.update(id, sansStatut(data)),
    remove: c.remove,
  }
})
