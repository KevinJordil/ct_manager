<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useParkStore } from '../stores/park.js'
import ConfirmModal from '../components/common/ConfirmModal.vue'

/**
 * Site plan of the vehicle park with zones drawn on top.
 *
 * Zones are stored as fractions of the image, so the same layout renders
 * correctly whatever the plan's resolution or the display size. All the
 * geometry below therefore converts between three spaces: client pixels,
 * image pixels, and fractions.
 */
const store = useParkStore()
const { t } = useI18n()

onMounted(() => store.init())

// ── Image ──

const imageElement = ref(null)
const imageWidth = ref(0)
const imageHeight = ref(0)
const uploading = ref(false)
const uploadError = ref('')

const MAX_DIMENSION = 3000 // px, after downscaling
const MAX_FILE_MB = 60

function onImageLoad() {
  if (!imageElement.value) return
  imageWidth.value = imageElement.value.naturalWidth
  imageHeight.value = imageElement.value.naturalHeight
}

/** Downscales in the browser and re-encodes as JPEG, to keep the upload small. */
function downscale(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(t('park.readFailed')))
    reader.onload = event => {
      const image = new Image()
      image.onerror = () => reject(new Error(t('park.invalidImage')))
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          return reject(new Error(t('park.invalidImage')))
        }
        const scale = Math.min(1, MAX_DIMENSION / image.naturalWidth, MAX_DIMENSION / image.naturalHeight)
        const width = Math.round(image.naturalWidth * scale)
        const height = Math.round(image.naturalHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      image.src = event.target.result
    }
    reader.readAsDataURL(file)
  })
}

async function handleFile(file) {
  if (!file) return
  // SVG is excluded on purpose: it can carry scripts, and has no intrinsic size.
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    uploadError.value = t('park.unsupportedFormat')
    return
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    uploadError.value = t('park.fileTooLarge', { max: MAX_FILE_MB })
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    await store.setImage(await downscale(file))
    editing.value = true
  } catch (error) {
    uploadError.value = error.message || t('park.invalidImage')
  } finally {
    uploading.value = false
  }
}

function onFileChange(event) {
  handleFile(event.target.files[0])
  event.target.value = ''
}

function onDrop(event) {
  handleFile(event.dataTransfer.files[0])
}

const confirmingImageDeletion = ref(false)

async function deleteImage() {
  await store.clearImage()
  confirmingImageDeletion.value = false
  editing.value = false
  imageWidth.value = 0
  imageHeight.value = 0
}

// ── Editing state ──

const editing = ref(false)
const svgElement = ref(null)
const selectedId = ref(null)
const selectedZone = computed(() => store.zones.find(zone => zone.id === selectedId.value) ?? null)

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b',
]

const currentColor = ref(COLORS[0])

function zoneStroke(zone) {
  return zone.color ?? '#6366f1'
}

function zoneFill(zone) {
  const hex = zoneStroke(zone)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.22)`
}

const selectedColor = computed(() =>
  selectedZone.value ? zoneStroke(selectedZone.value) : currentColor.value
)

function pickColor(color) {
  currentColor.value = color
  if (selectedZone.value) {
    store.updateZone(selectedZone.value.id, { color })
    store.save()
  }
}

// ── Label, shared by every zone of the same colour ──

const labelInput = ref('')

watch(selectedColor, color => {
  labelInput.value = store.colorLabels[color] ?? ''
}, { immediate: true })

function saveLabel() {
  store.setColorLabel(selectedColor.value, labelInput.value)
}

// ── Pointer interactions ──

const drawing = ref(null)
const shiftHeld = ref(false)
const dragState = ref(null)
const rotateState = ref(null)
const resizeState = ref(null)

/** Client coordinates → fraction of the image, clamped to it */
function clientToFraction(clientX, clientY) {
  const rect = svgElement.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  }
}

function centerX(zone) { return (zone.x + zone.w / 2) * imageWidth.value }
function centerY(zone) { return (zone.y + zone.h / 2) * imageHeight.value }

const drawingRect = computed(() => {
  if (!drawing.value) return null
  const { startX, startY, currentX, currentY } = drawing.value
  let w = Math.abs(currentX - startX)
  let h = Math.abs(currentY - startY)
  if (shiftHeld.value && svgElement.value) {
    // Shift constrains to a square, in displayed pixels rather than fractions.
    const rect = svgElement.value.getBoundingClientRect()
    const side = Math.min(w * rect.width, h * rect.height)
    w = side / rect.width
    h = side / rect.height
  }
  return {
    x: currentX >= startX ? startX : startX - w,
    y: currentY >= startY ? startY : startY - h,
    w, h,
  }
})

function onSurfaceMousedown(event) {
  if (!editing.value || event.target.closest('[data-zone]')) return
  event.preventDefault()
  selectedId.value = null
  const { x, y } = clientToFraction(event.clientX, event.clientY)
  drawing.value = { startX: x, startY: y, currentX: x, currentY: y }
}

function onZoneMousedown(event, zone) {
  if (!editing.value) return
  event.stopPropagation()
  event.preventDefault()
  selectedId.value = zone.id
  const { x, y } = clientToFraction(event.clientX, event.clientY)
  dragState.value = {
    id: zone.id, startX: x, startY: y, originX: zone.x, originY: zone.y, moved: false,
  }
}

function onRotateMousedown(event, zone) {
  event.stopPropagation()
  event.preventDefault()
  selectedId.value = zone.id
  rotateState.value = {
    id: zone.id,
    centerX: zone.x + zone.w / 2,
    centerY: zone.y + zone.h / 2,
  }
}

/**
 * Resizing keeps the opposite corner fixed. That corner is computed once, in
 * image pixels, using the angle at mousedown: reading the angle later would
 * pick up a value already changed by this very drag.
 */
function onResizeMousedown(event, zone, handle) {
  event.stopPropagation()
  event.preventDefault()
  const angle = (zone.angle || 0) * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const cx = (zone.x + zone.w / 2) * imageWidth.value
  const cy = (zone.y + zone.h / 2) * imageHeight.value
  const halfWidth = zone.w * imageWidth.value / 2
  const halfHeight = zone.h * imageHeight.value / 2

  const oppositeCorner = {
    tl: [halfWidth, halfHeight],
    tr: [-halfWidth, halfHeight],
    br: [-halfWidth, -halfHeight],
    bl: [halfWidth, -halfHeight],
  }[handle]

  const [localX, localY] = oppositeCorner
  resizeState.value = {
    id: zone.id,
    angle: zone.angle || 0,
    fixedX: cx + cos * localX - sin * localY,
    fixedY: cy + sin * localX + cos * localY,
  }
}

function onGlobalMousemove(event) {
  if (drawing.value) {
    const { x, y } = clientToFraction(event.clientX, event.clientY)
    drawing.value = { ...drawing.value, currentX: x, currentY: y }
  }

  if (dragState.value) {
    const { x, y } = clientToFraction(event.clientX, event.clientY)
    const state = dragState.value
    const dx = x - state.startX
    const dy = y - state.startY
    if (Math.abs(dx) > 0.003 || Math.abs(dy) > 0.003) state.moved = true
    const zone = store.zones.find(z => z.id === state.id)
    if (zone) {
      store.updateZone(zone.id, {
        x: Math.max(0, Math.min(1 - zone.w, state.originX + dx)),
        y: Math.max(0, Math.min(1 - zone.h, state.originY + dy)),
      })
    }
  }

  if (rotateState.value) {
    const { x, y } = clientToFraction(event.clientX, event.clientY)
    const state = rotateState.value
    const raw = Math.atan2(y - state.centerY, x - state.centerX) * 180 / Math.PI + 90
    store.updateZone(state.id, { angle: ((Math.round(raw) % 360) + 360) % 360 })
  }

  if (resizeState.value) {
    const { x, y } = clientToFraction(event.clientX, event.clientY)
    const state = resizeState.value
    const zone = store.zones.find(z => z.id === state.id)
    if (!zone) return

    const angle = state.angle * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    // Vector from the fixed corner to the pointer, in image pixels…
    const dx = x * imageWidth.value - state.fixedX
    const dy = y * imageHeight.value - state.fixedY
    // …projected onto the zone's own axes.
    const alongWidth = cos * dx + sin * dy
    const alongHeight = -sin * dx + cos * dy

    const minimum = Math.max(10, imageWidth.value * 0.01)
    const widthPx = Math.max(minimum, Math.abs(alongWidth))
    const heightPx = Math.max(minimum, Math.abs(alongHeight))

    const halfAlongWidth = (alongWidth >= 0 ? 1 : -1) * widthPx / 2
    const halfAlongHeight = (alongHeight >= 0 ? 1 : -1) * heightPx / 2
    const newCenterX = state.fixedX + cos * halfAlongWidth - sin * halfAlongHeight
    const newCenterY = state.fixedY + sin * halfAlongWidth + cos * halfAlongHeight

    const w = widthPx / imageWidth.value
    const h = heightPx / imageHeight.value
    store.updateZone(zone.id, {
      x: Math.max(0, newCenterX / imageWidth.value - w / 2),
      y: Math.max(0, newCenterY / imageHeight.value - h / 2),
      w, h,
    })
  }
}

function onGlobalMouseup() {
  if (drawing.value) {
    const rect = drawingRect.value
    drawing.value = null
    // Ignore accidental clicks that drew almost nothing.
    if (rect && rect.w > 0.015 && rect.h > 0.015) {
      selectedId.value = store.addZone({ ...rect, angle: 0, color: currentColor.value })
    }
  }
  if (dragState.value) {
    if (dragState.value.moved) store.save()
    dragState.value = null
  }
  if (rotateState.value) {
    store.save()
    rotateState.value = null
  }
  if (resizeState.value) {
    store.save()
    resizeState.value = null
  }
}

function onKeydown(event) {
  if (event.key === 'Shift') shiftHeld.value = true
  if (event.key === 'Escape') selectedId.value = null
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId.value && editing.value) {
    const tag = document.activeElement?.tagName
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') deleteSelected()
  }
}

function onKeyup(event) {
  if (event.key === 'Shift') shiftHeld.value = false
}

onMounted(() => {
  // Bound on the window: a drag continues even when the pointer leaves the plan.
  window.addEventListener('mousemove', onGlobalMousemove)
  window.addEventListener('mouseup', onGlobalMouseup)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onGlobalMousemove)
  window.removeEventListener('mouseup', onGlobalMouseup)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
})

function deleteSelected() {
  store.removeZone(selectedId.value)
  selectedId.value = null
}

function setAngle(value) {
  const angle = ((Math.round(Number(value)) % 360) + 360) % 360
  store.updateZone(selectedZone.value.id, { angle })
  store.save()
}

// Handles scale with the image so they stay usable on a large plan.
const rotateHandleGap = computed(() => Math.max(28, Math.round(imageHeight.value * 0.025)))
const rotateHandleRadius = computed(() => Math.max(9, Math.round(imageWidth.value * 0.007)))
const resizeHandleSize = computed(() => Math.max(14, Math.round(imageWidth.value * 0.012)))

const usedColors = computed(() => [...new Set(store.zones.map(zone => zoneStroke(zone)))])

const RESIZE_HANDLES = [
  { key: 'tl', x: zone => zone.x * imageWidth.value, y: zone => zone.y * imageHeight.value },
  { key: 'tr', x: zone => (zone.x + zone.w) * imageWidth.value, y: zone => zone.y * imageHeight.value },
  { key: 'br', x: zone => (zone.x + zone.w) * imageWidth.value, y: zone => (zone.y + zone.h) * imageHeight.value },
  { key: 'bl', x: zone => zone.x * imageWidth.value, y: zone => (zone.y + zone.h) * imageHeight.value },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h1 class="page-title mb-0">{{ $t('park.title') }}</h1>
      <div v-if="store.imageUrl" class="flex gap-2 flex-wrap">
        <label class="btn-secondary cursor-pointer text-sm"
          :class="{ 'opacity-60 pointer-events-none': uploading }">
          {{ uploading ? $t('park.uploading') : $t('park.change') }}
          <input type="file" accept="image/*" class="hidden" @change="onFileChange" :disabled="uploading" />
        </label>
        <button @click="confirmingImageDeletion = true"
          class="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
          {{ $t('park.deleteImage') }}
        </button>
        <button v-if="!editing" @click="editing = true" class="btn-primary">
          {{ $t('park.editZones') }}
        </button>
        <button v-else @click="editing = false; selectedId = null" class="btn-secondary font-medium">
          ✓ {{ $t('park.done') }}
        </button>
      </div>
    </div>

    <p v-if="uploadError" role="alert"
      class="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
      {{ uploadError }}
      <button @click="uploadError = ''" class="text-red-400 hover:text-red-600 ml-4"
        :aria-label="$t('actions.hide')">✕</button>
    </p>

    <!-- No plan yet -->
    <div v-if="!store.imageUrl && store.loaded"
      class="border-2 border-dashed border-stone-300 rounded-2xl bg-stone-50 flex flex-col items-center justify-center py-20 gap-4 transition-colors hover:border-olive-400 hover:bg-olive-50/30"
      @dragover.prevent @drop.prevent="onDrop">
      <svg class="w-14 h-14 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <div class="text-center">
        <p class="text-stone-700 font-medium">{{ $t('park.noImage') }}</p>
        <p class="text-sm text-stone-500 mt-1">{{ $t('park.dropHint') }}</p>
      </div>
      <label class="btn-primary cursor-pointer" :class="{ 'opacity-60 pointer-events-none': uploading }">
        {{ uploading ? $t('park.uploading') : $t('park.choose') }}
        <input type="file" accept="image/*" class="hidden" @change="onFileChange" :disabled="uploading" />
      </label>
    </div>

    <!-- Plan present -->
    <div v-else-if="store.imageUrl" class="flex flex-col gap-3">
      <div v-if="editing"
        class="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-800">
        <span v-for="hint in ['draw', 'square', 'move', 'resize', 'rotate', 'delete']" :key="hint">
          {{ $t(`park.help.${hint}`) }}
        </span>
      </div>

      <p v-if="imageWidth && imageHeight" class="text-xs text-stone-400">
        {{ imageWidth }} × {{ imageHeight }} px
        <span class="text-stone-300">·</span>
        {{ $t('park.zones', store.zones.length, { count: store.zones.length }) }}
      </p>

      <div class="flex flex-col items-center gap-2">
        <div v-if="!editing && store.zones.length"
          class="flex flex-wrap justify-center gap-4 text-xs text-stone-600">
          <span v-for="color in usedColors" :key="color" class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm" :style="{ background: color, opacity: 0.85 }" />
            {{ store.colorLabels[color] || color }}
          </span>
        </div>

        <div class="rounded-xl shadow-md border border-stone-200 overflow-hidden"
          style="width: fit-content; max-width: 100%;"
          @dragover.prevent @drop.prevent="onDrop">
          <div class="relative inline-block max-w-full">
            <img ref="imageElement" :src="store.imageUrl" @load="onImageLoad" alt=""
              class="block max-w-full select-none"
              style="max-height: calc(100svh - 260px); width: auto;" draggable="false" />

            <svg v-if="imageWidth && imageHeight" ref="svgElement"
              :viewBox="`0 0 ${imageWidth} ${imageHeight}`" preserveAspectRatio="none"
              class="absolute inset-0 w-full h-full"
              :style="{ cursor: editing ? 'crosshair' : 'default' }"
              @mousedown.prevent="onSurfaceMousedown">

              <g v-for="zone in store.zones" :key="zone.id" data-zone="true"
                :transform="`rotate(${zone.angle || 0}, ${centerX(zone)}, ${centerY(zone)})`"
                :style="{ cursor: editing ? 'move' : 'default' }"
                @mousedown.stop.prevent="onZoneMousedown($event, zone)">
                <rect
                  :x="zone.x * imageWidth" :y="zone.y * imageHeight"
                  :width="zone.w * imageWidth" :height="zone.h * imageHeight"
                  :fill="zoneFill(zone)" :stroke="zoneStroke(zone)"
                  :stroke-width="selectedId === zone.id ? 4 : 2"
                  :stroke-dasharray="selectedId === zone.id ? '14 7' : 'none'"
                  vector-effect="non-scaling-stroke" rx="4" />

                <template v-if="editing && selectedId === zone.id">
                  <line :x1="centerX(zone)" :y1="zone.y * imageHeight"
                    :x2="centerX(zone)" :y2="zone.y * imageHeight - rotateHandleGap"
                    stroke="white" stroke-width="2" stroke-dasharray="4 3"
                    vector-effect="non-scaling-stroke" pointer-events="none" />
                  <circle :cx="centerX(zone)" :cy="zone.y * imageHeight - rotateHandleGap"
                    :r="rotateHandleRadius" fill="white" :stroke="zoneStroke(zone)" stroke-width="3"
                    vector-effect="non-scaling-stroke" style="cursor: grab"
                    @mousedown.stop.prevent="onRotateMousedown($event, zone)" />
                  <text v-if="rotateState?.id === zone.id"
                    :x="centerX(zone) + rotateHandleRadius + 4" :y="zone.y * imageHeight - rotateHandleGap"
                    :font-size="Math.max(14, Math.round(imageWidth * 0.008))"
                    fill="white" dominant-baseline="middle" pointer-events="none"
                    style="font-family: system-ui, sans-serif; font-weight: 600;">
                    {{ zone.angle || 0 }}°
                  </text>

                  <rect v-for="handle in RESIZE_HANDLES" :key="handle.key"
                    :x="handle.x(zone) - resizeHandleSize / 2"
                    :y="handle.y(zone) - resizeHandleSize / 2"
                    :width="resizeHandleSize" :height="resizeHandleSize"
                    fill="white" :stroke="zoneStroke(zone)" stroke-width="2.5"
                    vector-effect="non-scaling-stroke" rx="2"
                    style="cursor: nwse-resize"
                    @mousedown.stop.prevent="onResizeMousedown($event, zone, handle.key)" />
                </template>
              </g>

              <rect v-if="drawingRect"
                :x="drawingRect.x * imageWidth" :y="drawingRect.y * imageHeight"
                :width="drawingRect.w * imageWidth" :height="drawingRect.h * imageHeight"
                :fill="zoneFill({ color: currentColor })" :stroke="currentColor"
                stroke-width="2" stroke-dasharray="10 5"
                vector-effect="non-scaling-stroke" rx="4" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Selected zone -->
      <Transition name="fade">
        <div v-if="editing && selectedZone" class="card border-stone-200">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-stone-800 flex items-center gap-2">
              <span class="w-3 h-3 rounded-sm shrink-0 border border-black/10"
                :style="{ background: zoneStroke(selectedZone) }" />
              {{ $t('park.selectedZone') }}
            </h2>
            <button @click="deleteSelected"
              class="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">
              {{ $t('park.deleteZone') }}
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="label" for="zone-label">
                {{ $t('park.label') }}
                <span class="ml-1 font-normal text-stone-400">{{ $t('park.labelHint') }}</span>
              </label>
              <input id="zone-label" v-model="labelInput" type="text" class="input"
                :placeholder="$t('park.labelPlaceholder')"
                @blur="saveLabel" @keyup.enter="event => { saveLabel(); event.target.blur() }" />
            </div>

            <div>
              <span class="label" id="zone-color-label">{{ $t('park.color') }}</span>
              <div class="flex flex-wrap gap-2 pt-1" role="group" aria-labelledby="zone-color-label">
                <button v-for="color in COLORS" :key="color" type="button"
                  @click="pickColor(color)" :title="color" :aria-label="color"
                  :aria-pressed="selectedColor === color"
                  class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  :style="{
                    background: color,
                    borderColor: selectedColor === color ? 'white' : 'transparent',
                    outline: selectedColor === color ? `2px solid ${color}` : 'none',
                    outlineOffset: '1px',
                  }" />
              </div>
            </div>

            <div>
              <label class="label" for="zone-angle">
                {{ $t('park.rotation') }} :
                <span class="font-semibold" :style="{ color: zoneStroke(selectedZone) }">
                  {{ selectedZone.angle || 0 }}°
                </span>
              </label>
              <div class="flex items-center gap-2 pt-1">
                <input type="range" min="0" max="359" :value="selectedZone.angle || 0"
                  :aria-label="$t('park.rotation')"
                  @input="event => setAngle(event.target.value)"
                  class="flex-1 h-2 cursor-pointer accent-indigo-600" />
                <input id="zone-angle" type="number" min="0" max="359" :value="selectedZone.angle || 0"
                  @change="event => setAngle(event.target.value)"
                  class="input w-20 text-sm text-center" />
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Colour of the next zone -->
      <Transition name="fade">
        <div v-if="editing && !selectedZone"
          class="flex flex-wrap items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm">
          <span class="text-stone-600 font-medium shrink-0">{{ $t('park.nextZoneColor') }}</span>
          <div class="flex flex-wrap gap-2">
            <button v-for="color in COLORS" :key="color" type="button"
              @click="currentColor = color" :title="color" :aria-label="color"
              :aria-pressed="currentColor === color"
              class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              :style="{
                background: color,
                borderColor: currentColor === color ? 'white' : 'transparent',
                outline: currentColor === color ? `2px solid ${color}` : 'none',
                outlineOffset: '1px',
              }" />
          </div>
        </div>
      </Transition>
    </div>

    <ConfirmModal v-if="confirmingImageDeletion"
      :title="$t('park.deleteImage')"
      :message="$t('park.deleteImageConfirm')"
      @confirm="deleteImage"
      @cancel="confirmingImageDeletion = false" />
  </div>
</template>
