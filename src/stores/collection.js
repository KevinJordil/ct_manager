import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { newId } from '../id.js'
import {
  signalerErreur, signalerCleRequise, effacerErreur,
  debutEnregistrement, finEnregistrement,
} from './sync.js'

/**
 * Squelette commun aux collections persistées (personnes, véhicules, missions) :
 * chargement unique, migration du format historique, CRUD et enregistrement.
 *
 * @param entity  nom de la collection côté API
 * @param migrate transformation appliquée aux données chargées
 */
export function useCollection(entity, migrate = data => data) {
  const items = ref([])
  const chargement = ref(false)
  const chargee = ref(false)
  const erreurChargement = ref(null)
  // Version renvoyée par le serveur au dernier échange réussi ; sert de garde
  // contre l'écrasement des modifications faites depuis un autre onglet.
  let version = null
  let initPromise = null

  function traiterErreur(err, prefixe) {
    if (err.status === 401) return signalerCleRequise()
    if (err.status === 409) {
      version = err.version ?? version
      return signalerErreur(
        `${entity} : les données ont été modifiées ailleurs. Rechargez la page pour repartir de la version du serveur.`,
        { conflit: true },
      )
    }
    signalerErreur(`${prefixe} (${entity}) : ${err.message}`)
  }

  async function init() {
    if (initPromise) return initPromise
    chargement.value = true
    initPromise = (async () => {
      try {
        const { data, version: v } = await api.load(entity)
        items.value = migrate(data)
        version = v
        erreurChargement.value = null
      } catch (err) {
        erreurChargement.value = err.message
        traiterErreur(err, 'Chargement impossible')
      } finally {
        chargement.value = false
        chargee.value = true
      }
    })()
    return initPromise
  }

  /** Relance un chargement en oubliant le précédent (bouton « Réessayer ») */
  async function recharger() {
    initPromise = null
    chargee.value = false
    effacerErreur()
    return init()
  }

  async function persist() {
    // Sans chargement réussi, la collection en mémoire est vide : l'enregistrer
    // remplacerait le fichier du serveur par un tableau vide.
    if (!version) {
      return signalerErreur(
        `${entity} : données non chargées, enregistrement annulé pour ne pas écraser le serveur.`,
      )
    }
    debutEnregistrement()
    try {
      const { version: nouvelle } = await api.save(entity, items.value, version)
      version = nouvelle
      effacerErreur()
    } catch (err) {
      traiterErreur(err, 'Enregistrement impossible')
    } finally {
      finEnregistrement()
    }
  }

  function add(data) {
    const item = { ...data, id: newId() }
    items.value.push(item)
    persist()
    return item
  }

  function update(id, data) {
    const idx = items.value.findIndex(i => i.id === id)
    if (idx === -1) return
    const { id: _ignore, ...rest } = data
    items.value[idx] = { ...items.value[idx], ...rest }
    persist()
  }

  function remove(id) {
    items.value = items.value.filter(i => i.id !== id)
    persist()
  }

  /** Applique une mutation à un élément puis enregistre, s'il existe */
  function mutate(id, fn) {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    fn(item)
    persist()
  }

  return {
    items,
    chargement: readonly(chargement),
    chargee: readonly(chargee),
    erreurChargement: readonly(erreurChargement),
    init, recharger, add, update, remove, mutate, persist,
  }
}
