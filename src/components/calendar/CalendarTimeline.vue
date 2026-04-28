<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  events: { type: Array, required: true },
  view: { type: String, required: true }, // 'day' | 'week'
  date: { type: String, required: true },  // YYYY-MM-DD
})

const EVENT_H = 24
const EVENT_GAP = 2
const ROW_PAD = 5

// ── Period ──

const DOW_FR   = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa']
const DOW_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MONTHS_SHORT = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function getMondayStr(dateStr) {
  const d = new Date(dateStr + 'T00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

const todayStr = new Date().toISOString().slice(0, 10)

const periodStart = computed(() =>
  props.view === 'day' ? props.date + 'T00:00' : getMondayStr(props.date) + 'T00:00'
)

const periodEnd = computed(() => {
  if (props.view === 'day') return props.date + 'T23:59'
  const d = new Date(getMondayStr(props.date) + 'T00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10) + 'T23:59'
})

const totalMinutes = computed(() => props.view === 'day' ? 24 * 60 : 7 * 24 * 60)

function dtToMinutes(dt) {
  return (new Date(dt) - new Date(periodStart.value)) / 60000
}

function pct(dt) {
  return Math.max(0, Math.min(100, (dtToMinutes(dt) / totalMinutes.value) * 100))
}

// ── Header: day segments (row 1) ──

const daySegments = computed(() => {
  if (props.view === 'day') {
    const d = new Date(props.date + 'T00:00')
    return [{
      dateStr: props.date,
      label: `${DOW_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`,
      pct: 0,
      width: 100,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: props.date === todayStr,
    }]
  }
  const monday = getMondayStr(props.date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday + 'T00:00')
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    return {
      dateStr,
      label: `${DOW_FR[d.getDay()]} ${d.getDate()}`,
      sublabel: MONTHS_SHORT[d.getMonth()],
      pct: (i / 7) * 100,
      width: 100 / 7,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: dateStr === todayStr,
    }
  })
})

// ── Header: hour ticks (row 2) ──

const hourTicks = computed(() => {
  const ticks = []
  if (props.view === 'day') {
    // Toutes les 2 heures, labels toutes les 2h
    for (let h = 0; h < 24; h++) {
      const isMajor = h % 6 === 0
      const hasLabel = h % 2 === 0
      ticks.push({
        label: hasLabel ? `${String(h).padStart(2, '0')}h` : '',
        pct: (h * 60 / totalMinutes.value) * 100,
        major: isMajor,
        hasLabel,
      })
    }
  } else {
    // Toutes les 6h par jour : 00h, 06h, 12h, 18h
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h += 3) {
        const isMajor = h % 6 === 0
        const hasLabel = h % 6 === 0
        ticks.push({
          label: hasLabel ? `${String(h).padStart(2, '0')}h` : '',
          pct: ((d * 24 + h) * 60 / totalMinutes.value) * 100,
          major: isMajor,
          isDayStart: h === 0,
          hasLabel,
        })
      }
    }
  }
  return ticks
})

// ── Grid lines ──

const gridLines = computed(() => {
  const lines = []
  if (props.view === 'day') {
    for (let h = 1; h < 24; h++) {
      lines.push({ pct: (h * 60 / totalMinutes.value) * 100, major: h % 6 === 0, dayBorder: false })
    }
  } else {
    for (let d = 1; d <= 7; d++) {
      lines.push({ pct: (d * 24 * 60 / totalMinutes.value) * 100, major: true, dayBorder: true })
    }
    for (let d = 0; d < 7; d++) {
      for (let h = 1; h < 24; h++) {
        if (h % 24 !== 0) {
          lines.push({
            pct: ((d * 24 + h) * 60 / totalMinutes.value) * 100,
            major: h % 6 === 0,
            dayBorder: false,
          })
        }
      }
    }
  }
  return lines
})

// ── Current time ──

const nowRef = ref(new Date())
let timer = null
onMounted(() => { timer = setInterval(() => { nowRef.value = new Date() }, 60000) })
onUnmounted(() => clearInterval(timer))

const nowPct = computed(() => {
  const nowStr = nowRef.value.toISOString().slice(0, 16)
  if (nowStr < periodStart.value || nowStr > periodEnd.value) return null
  return pct(nowStr)
})

// ── Lane packing ──

function packLanes(events) {
  const inPeriod = events.filter(e => e.dateDebut < periodEnd.value && e.dateFin > periodStart.value)
  const sorted = [...inPeriod].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
  const laneEnds = []
  return sorted.map(ev => {
    let lane = laneEnds.findIndex(end => end <= ev.dateDebut)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.dateFin) }
    else laneEnds[lane] = ev.dateFin
    return { ...ev, _lane: lane }
  })
}

const rowsData = computed(() =>
  props.rows.map(row => {
    const evs = packLanes(props.events.filter(e => e.rowId === row.id))
    const lanes = evs.length ? Math.max(...evs.map(e => e._lane)) + 1 : 0
    const height = ROW_PAD * 2 + Math.max(1, lanes) * (EVENT_H + EVENT_GAP) - EVENT_GAP
    return { row, evs, height }
  })
)

// ── Event rendering ──

function evWidthPct(ev) {
  return Math.max(0.2, pct(ev.dateFin) - pct(ev.dateDebut))
}

function evStyle(ev) {
  const startPct = pct(ev.dateDebut)
  return {
    left: startPct + '%',
    width: evWidthPct(ev) + '%',
    top: ROW_PAD + ev._lane * (EVENT_H + EVENT_GAP) + 'px',
    height: EVENT_H + 'px',
  }
}

function hhmm(dt) {
  return dt ? dt.slice(11, 16) : ''
}

// Seuils pour afficher le contenu selon la largeur (% de la période totale)
// Jour : 1% ≈ 14 min  |  Semaine : 1% ≈ 100 min
function evDisplayMode(ev) {
  const w = evWidthPct(ev)
  if (props.view === 'day') {
    if (w >= 7)  return 'full'   // ≥ ~1h : "HH:MM–HH:MM  Titre"
    if (w >= 2)  return 'times'  // ≥ ~17min : "HH:MM–HH:MM"
    if (w >= 0.8) return 'start' // ≥ ~7min : "HH:MM"
    return 'none'
  } else {
    if (w >= 10)  return 'full'  // ≥ ~17h : "HH:MM–HH:MM  Titre"
    if (w >= 4)   return 'times' // ≥ ~7h  : "HH:MM–HH:MM"
    if (w >= 1.5) return 'start' // ≥ ~2.5h : "HH:MM"
    return 'none'
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white w-full">
    <div style="min-width: 420px;">

      <!-- ═══ En-tête collant (2 lignes) ═══ -->
      <div class="sticky top-0 z-10 shadow-sm">

        <!-- Ligne 1 : jours -->
        <div class="flex bg-gray-50 border-b border-gray-200">
          <div class="shrink-0 sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-3 flex items-center"
            style="width: 160px; height: 34px;">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ressource</span>
          </div>
          <div class="flex-1 flex overflow-hidden">
            <div v-for="seg in daySegments" :key="seg.dateStr"
              :style="{ width: seg.width + '%' }"
              :class="['flex flex-col justify-center px-2 py-1 border-l overflow-hidden',
                seg.isToday  ? 'bg-blue-50 border-blue-200'
                : seg.isWeekend ? 'bg-gray-100 border-gray-200'
                : 'bg-gray-50 border-gray-200']">
              <span :class="['text-xs font-semibold truncate leading-tight',
                seg.isToday ? 'text-blue-700' : 'text-gray-700']">
                {{ seg.label }}
              </span>
              <span v-if="seg.sublabel" class="text-[10px] text-gray-400 leading-none mt-0.5">{{ seg.sublabel }}</span>
            </div>
          </div>
        </div>

        <!-- Ligne 2 : heures -->
        <div class="flex bg-white border-b-2 border-gray-300">
          <div class="shrink-0 sticky left-0 z-20 bg-white border-r border-gray-200"
            style="width: 160px; height: 22px;" />
          <div class="flex-1 relative overflow-hidden" style="height: 22px;">
            <div v-for="tick in hourTicks" :key="tick.pct"
              :style="{ left: tick.pct + '%' }"
              :class="['absolute top-0 bottom-0 flex items-center',
                tick.isDayStart ? 'border-l-2 border-gray-400'
                : tick.major    ? 'border-l border-gray-300'
                :                 'border-l border-gray-100']">
              <span v-if="tick.hasLabel"
                class="text-[10px] font-semibold text-gray-500 pl-1 whitespace-nowrap leading-none">
                {{ tick.label }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Lignes de ressources ═══ -->
      <div v-for="{ row, evs, height } in rowsData" :key="row.id"
        :style="{ height: height + 'px' }"
        class="flex border-b border-gray-100 hover:bg-gray-50/30 transition-colors">

        <!-- Label ressource (collant à gauche) -->
        <div class="shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 px-3 flex items-center"
          style="width: 160px;">
          <div class="min-w-0">
            <p class="font-medium text-gray-800 text-sm truncate leading-tight">{{ row.label }}</p>
            <p v-if="row.sublabel" class="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{{ row.sublabel }}</p>
          </div>
        </div>

        <!-- Zone temporelle -->
        <div class="flex-1 relative overflow-hidden">

          <!-- Fond weekend -->
          <div v-for="seg in daySegments.filter(s => s.isWeekend)" :key="'bg-' + seg.dateStr"
            :style="{ left: seg.pct + '%', width: seg.width + '%' }"
            class="absolute top-0 bottom-0 bg-gray-50/70 pointer-events-none" />

          <!-- Fond aujourd'hui -->
          <div v-for="seg in daySegments.filter(s => s.isToday)" :key="'today-' + seg.dateStr"
            :style="{ left: seg.pct + '%', width: seg.width + '%' }"
            class="absolute top-0 bottom-0 bg-blue-50/40 pointer-events-none" />

          <!-- Lignes de grille -->
          <div v-for="line in gridLines" :key="line.pct + '-' + line.dayBorder"
            :style="{ left: line.pct + '%' }"
            :class="['absolute top-0 bottom-0 pointer-events-none',
              line.dayBorder ? 'border-l-2 border-gray-300'
              : line.major   ? 'border-l border-gray-200'
              :                'border-l border-gray-100']" />

          <!-- Heure actuelle -->
          <div v-if="nowPct !== null"
            :style="{ left: nowPct + '%' }"
            class="absolute top-0 bottom-0 border-l-2 border-red-500 z-20 pointer-events-none">
            <div class="absolute -top-0 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
          </div>

          <!-- Événements -->
          <div v-for="ev in evs" :key="ev.id"
            :style="evStyle(ev)"
            :class="['absolute rounded overflow-hidden cursor-default select-none flex items-center', ev.colorClass]"
            :title="`${hhmm(ev.dateDebut)} – ${hhmm(ev.dateFin)}  •  ${ev.label}`">

            <template v-if="evDisplayMode(ev) === 'full'">
              <span class="px-1.5 truncate leading-none font-medium" style="font-size: 11px;">
                <span class="opacity-80 font-bold">{{ hhmm(ev.dateDebut) }}–{{ hhmm(ev.dateFin) }}</span>
                &thinsp;{{ ev.label }}
              </span>
            </template>

            <template v-else-if="evDisplayMode(ev) === 'times'">
              <span class="px-1.5 truncate leading-none font-bold" style="font-size: 11px;">
                {{ hhmm(ev.dateDebut) }}–{{ hhmm(ev.dateFin) }}
              </span>
            </template>

            <template v-else-if="evDisplayMode(ev) === 'start'">
              <span class="px-1 leading-none font-bold whitespace-nowrap" style="font-size: 10px;">
                {{ hhmm(ev.dateDebut) }}
              </span>
            </template>
            <!-- mode 'none' : bloc coloré sans texte -->
          </div>
        </div>
      </div>

      <div v-if="rows.length === 0"
        class="py-10 text-center text-sm text-gray-400 italic">
        Aucune ressource à afficher
      </div>
    </div>
  </div>
</template>
