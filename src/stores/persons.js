import { defineStore } from 'pinia'
import { newId } from '../id.js'
import { migratePersons } from '../migrations.js'
import { useCollection } from './collection.js'

export const usePersonsStore = defineStore('persons', () => {
  const collection = useCollection('persons', migratePersons)

  function add(person) {
    return collection.add({
      ...person,
      leaves: [],
      unavailable: false,
      unavailabilityNote: '',
    })
  }

  function addLeave(personId, leave) {
    collection.mutate(personId, person => {
      if (!person.leaves) person.leaves = []
      person.leaves.push({ ...leave, id: newId() })
    })
  }

  function removeLeave(personId, leaveId) {
    collection.mutate(personId, person => {
      person.leaves = person.leaves.filter(l => l.id !== leaveId)
    })
  }

  function markUnavailable(id, note) {
    collection.mutate(id, person => {
      person.unavailable = true
      person.unavailabilityNote = note
    })
  }

  function clearUnavailable(id) {
    collection.mutate(id, person => {
      person.unavailable = false
      person.unavailabilityNote = ''
    })
  }

  return {
    persons: collection.items,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    update: collection.update,
    remove: collection.remove,
    add, addLeave, removeLeave, markUnavailable, clearUnavailable,
  }
})
