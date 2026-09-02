import { ref, computed } from 'vue'
import { toDateString, toDateTimeString } from '../datetime.js'

/**
 * The application's single reactive clock.
 *
 * Without it, a computed that calls `new Date()` never recomputes: Vue does
 * not track time as a dependency, and a mission starting while the page is
 * open would stay displayed as "planned".
 *
 * `now` advances every second (for the header clock) while `nowString` and
 * `todayString` only change *value* on the minute and on the day, so the
 * computeds depending on them are not re-evaluated needlessly.
 */

const now = ref(new Date())
const nowString = computed(() => toDateTimeString(now.value))
const todayString = computed(() => toDateString(now.value))

let timer = null

export function useClock() {
  // Refreshed on every call rather than only at module load: the value must
  // reflect the moment the component mounts, not the moment the bundle was
  // first evaluated.
  now.value = new Date()
  if (timer === null && typeof window !== 'undefined') {
    timer = setInterval(() => { now.value = new Date() }, 1000)
  }
  return { now, nowString, todayString }
}
