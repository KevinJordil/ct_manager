import { ref, computed } from 'vue'
import { toDateStr, toDateTimeStr } from '../datetime.js'

/**
 * Horloge unique et réactive de l'application.
 *
 * Sans elle, un `computed` qui appelle `new Date()` ne se recalcule jamais :
 * Vue ne trace pas le temps comme une dépendance, et une mission qui démarre
 * pendant que la page est ouverte resterait affichée « planifiée ».
 *
 * `now` avance chaque seconde (pour l'horloge de l'en-tête) tandis que
 * `nowStr` et `todayStr` ne changent de *valeur* qu'à la minute et au jour :
 * les computed qui en dépendent ne se réévaluent donc pas inutilement.
 */

const now = ref(new Date())
const nowStr = computed(() => toDateTimeStr(now.value))
const todayStr = computed(() => toDateStr(now.value))

let timer = null

export function useClock() {
  if (timer === null && typeof window !== 'undefined') {
    timer = setInterval(() => { now.value = new Date() }, 1000)
  }
  return { now, nowStr, todayStr }
}
