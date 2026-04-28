import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api.js'
import { addTimeIfMissing } from '../utils.js'

// ── Helpers exportés ──

export function getStatut(person) {
  if (person.indisponible) return 'indisponible'
  const now = new Date().toISOString().slice(0, 16)
  return person.conges?.some(c => c.dateDebut <= now && now <= c.dateFin)
    ? 'en congé'
    : 'disponible'
}

export function isEnCongePendant(person, dateDebut, dateFin) {
  if (!dateDebut || !dateFin || !person.conges?.length) return false
  return person.conges.some(c => c.dateDebut <= dateFin && c.dateFin >= dateDebut)
}

// ── Migration des données existantes ──

function migrate(data) {
  return data.map(p => {
    let person = { ...p }
    // Ancien format : statut string → conges array
    if (!person.conges) {
      const conges = person.statut === 'en congé'
        ? [{ id: `mig-${person.id}`, dateDebut: '2026-01-01T00:00', dateFin: '2099-12-31T23:59' }]
        : []
      const { statut: _s, ...rest } = person
      person = { ...rest, conges }
    }
    // Migration permis civils → militaires suisses
    const PERMIS_MAP = { B: '920', BE: '920E', C: '930', CE: '930E' }
    person.permis = (person.permis ?? []).map(p => PERMIS_MAP[p] ?? p)
    // Conges sans heure → ajouter heure par défaut
    person.conges = person.conges.map(c => ({
      ...c,
      dateDebut: addTimeIfMissing(c.dateDebut, '00:00'),
      dateFin: addTimeIfMissing(c.dateFin, '23:59'),
    }))
    // Champs ajoutés au fil des versions
    if (person.grade === undefined) person.grade = ''
    if (person.indisponible === undefined) person.indisponible = false
    if (person.commentaireIndisponible === undefined) person.commentaireIndisponible = ''
    return person
  })
}

// ── Store ──

export const usePersonsStore = defineStore('persons', () => {
  const persons = ref([])
  let initPromise = null

  async function init() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const raw = await api.load('persons')
        persons.value = migrate(raw)
      } catch (err) {
        console.warn('[persons] server unavailable:', err.message)
      }
    })()
    return initPromise
  }

  function _save() { api.save('persons', persons.value) }

  function add(person) {
    persons.value.push({
      ...person,
      id: Date.now().toString(),
      conges: [],
      indisponible: false,
      commentaireIndisponible: '',
    })
    _save()
  }

  function update(id, data) {
    const idx = persons.value.findIndex(p => p.id === id)
    if (idx !== -1) persons.value[idx] = { ...persons.value[idx], ...data }
    _save()
  }

  function remove(id) {
    persons.value = persons.value.filter(p => p.id !== id)
    _save()
  }

  function addConge(personId, conge) {
    const p = persons.value.find(p => p.id === personId)
    if (p) {
      if (!p.conges) p.conges = []
      p.conges.push({ ...conge, id: Date.now().toString() })
      _save()
    }
  }

  function removeConge(personId, congeId) {
    const p = persons.value.find(p => p.id === personId)
    if (p) {
      p.conges = p.conges.filter(c => c.id !== congeId)
      _save()
    }
  }

  function setIndisponible(id, commentaire) {
    const p = persons.value.find(p => p.id === id)
    if (p) {
      p.indisponible = true
      p.commentaireIndisponible = commentaire
      _save()
    }
  }

  function clearIndisponible(id) {
    const p = persons.value.find(p => p.id === id)
    if (p) {
      p.indisponible = false
      p.commentaireIndisponible = ''
      _save()
    }
  }

  return { persons, init, add, update, remove, addConge, removeConge, setIndisponible, clearIndisponible }
})
