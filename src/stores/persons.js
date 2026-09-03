import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import { api } from '../api.js'
import { newId } from '../id.js'
import { migratePersons } from '../migrations.js'
import { useCollection } from './collection.js'

export const usePersonsStore = defineStore('persons', () => {
  const collection = useCollection('persons', migratePersons)

  /**
   * Ids of the persons who can sign in. A person exists in the application
   * long before anyone gives them a password; until then they have no account.
   */
  const withAccount = ref([])

  async function loadAccounts() {
    try {
      withAccount.value = await api.loadPersonAccounts()
    } catch {
      // Not being able to tell who has an account must not break the list.
      withAccount.value = []
    }
  }

  function hasAccount(personId) {
    return withAccount.value.includes(personId)
  }

  /** Throws, so the form can show the reason next to the password field. */
  async function setPassword(personId, lastName, password) {
    await api.setPersonPassword(personId, lastName, password)
    if (!withAccount.value.includes(personId)) withAccount.value.push(personId)
  }

  async function removeAccount(personId) {
    await api.deletePersonAccount(personId)
    withAccount.value = withAccount.value.filter(id => id !== personId)
  }

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
    withAccount: readonly(withAccount),
    loadAccounts, hasAccount, setPassword, removeAccount,
    loading: collection.loading,
    loaded: collection.loaded,
    init: collection.init,
    reload: collection.reload,
    update: collection.update,
    remove: collection.remove,
    add, addLeave, removeLeave, markUnavailable, clearUnavailable,
  }
})
