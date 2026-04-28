import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api.js'

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
  const vehicles = ref([])
  let initPromise = null

  async function init() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const raw = await api.load('vehicles')
        vehicles.value = migrate(raw)
      } catch (err) {
        console.warn('[vehicles] server unavailable:', err.message)
      }
    })()
    return initPromise
  }

  function _save() { api.save('vehicles', vehicles.value) }

  function add(vehicle) {
    vehicles.value.push({ ...vehicle, id: Date.now().toString() })
    _save()
  }

  function update(id, data) {
    const idx = vehicles.value.findIndex(v => v.id === id)
    if (idx !== -1) vehicles.value[idx] = { ...vehicles.value[idx], ...data }
    _save()
  }

  function remove(id) {
    vehicles.value = vehicles.value.filter(v => v.id !== id)
    _save()
  }

  function setPret(id, commentaire) {
    const v = vehicles.value.find(v => v.id === id)
    if (v) { v.statut = 'en prêt'; v.commentairePret = commentaire; _save() }
  }

  function liberer(id) {
    const v = vehicles.value.find(v => v.id === id)
    if (v) { v.statut = 'libre'; v.commentairePret = ''; _save() }
  }

  return { vehicles, init, add, update, remove, setPret, liberer }
})
