import { ref, readonly } from 'vue'

/**
 * État de synchronisation avec le serveur, partagé par toute l'application.
 *
 * Les sauvegardes partent en arrière-plan : sans ce canal, un échec (serveur
 * arrêté, requête rejetée, conflit avec un autre onglet) resterait invisible
 * et l'utilisateur perdrait son travail sans le savoir.
 */

const erreur = ref(null)
const conflit = ref(false)
const cleRequise = ref(false)
const enregistrement = ref(0)

export function signalerErreur(message, { conflit: estConflit = false } = {}) {
  erreur.value = message
  if (estConflit) conflit.value = true
}

export function signalerCleRequise() {
  cleRequise.value = true
  erreur.value = 'Clé d\'accès requise ou invalide'
}

export function effacerErreur() {
  erreur.value = null
  conflit.value = false
  cleRequise.value = false
}

export function debutEnregistrement() { enregistrement.value++ }
export function finEnregistrement() { enregistrement.value = Math.max(0, enregistrement.value - 1) }

export function useSync() {
  return {
    erreur: readonly(erreur),
    conflit: readonly(conflit),
    cleRequise: readonly(cleRequise),
    enregistrementEnCours: readonly(enregistrement),
    effacerErreur,
  }
}
