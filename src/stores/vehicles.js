import { defineStore } from 'pinia'
import { useCollection } from './collection.js'

// ── Migration des données existantes ──

const CATEGORIE_MAP = { léger: 'léger-route' }

function migrate(data) {
  return data.map(v => ({
    ...v,
    // 'en mission' est calculé dynamiquement, ne se stocke plus
    statut: v.statut === 'en mission' ? 'libre' : (v.statut ?? 'libre'),
    commentairePret: v.commentairePret ?? '',
    // Migration ancienne catégorie 'léger' → 'léger-route'
    categorie: CATEGORIE_MAP[v.categorie] ?? v.categorie,
    places: v.places ?? 4,
  }))
}

// ── Store ──

export const useVehiclesStore = defineStore('vehicles', () => {
  const c = useCollection('vehicles', migrate)

  function setPret(id, commentaire) {
    c.mutate(id, v => { v.statut = 'en prêt'; v.commentairePret = commentaire })
  }

  function liberer(id) {
    c.mutate(id, v => { v.statut = 'libre'; v.commentairePret = '' })
  }

  return {
    vehicles: c.items,
    chargement: c.chargement,
    chargee: c.chargee,
    init: c.init,
    recharger: c.recharger,
    add: c.add,
    update: c.update,
    remove: c.remove,
    setPret, liberer,
  }
})
