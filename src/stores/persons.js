import { defineStore } from 'pinia'
import { addTimeIfMissing } from '../datetime.js'
import { newId } from '../id.js'
import { useCollection } from './collection.js'

// ── Migration des données existantes ──

const PERMIS_MAP = { B: '920', BE: '920E', C: '930', CE: '930E' }

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
    person.permis = (person.permis ?? []).map(perm => PERMIS_MAP[perm] ?? perm)
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
  const c = useCollection('persons', migrate)

  function add(person) {
    return c.add({ ...person, conges: [], indisponible: false, commentaireIndisponible: '' })
  }

  function addConge(personId, conge) {
    c.mutate(personId, p => {
      if (!p.conges) p.conges = []
      p.conges.push({ ...conge, id: newId() })
    })
  }

  function removeConge(personId, congeId) {
    c.mutate(personId, p => { p.conges = p.conges.filter(x => x.id !== congeId) })
  }

  function setIndisponible(id, commentaire) {
    c.mutate(id, p => { p.indisponible = true; p.commentaireIndisponible = commentaire })
  }

  function clearIndisponible(id) {
    c.mutate(id, p => { p.indisponible = false; p.commentaireIndisponible = '' })
  }

  return {
    persons: c.items,
    chargement: c.chargement,
    chargee: c.chargee,
    init: c.init,
    recharger: c.recharger,
    update: c.update,
    remove: c.remove,
    add, addConge, removeConge, setIndisponible, clearIndisponible,
  }
})
