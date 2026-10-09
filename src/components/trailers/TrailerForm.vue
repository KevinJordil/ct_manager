<script setup>
import { reactive, watch, computed } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { useVehiclesStore } from '../../stores/vehicles.js'
import { fleetModels, modelKey } from '../../availability.js'

/**
 * A trailer: its plate, what it is, and the vehicle models it can be hitched
 * to — several of them, since one trailer may go behind a Class G and a Duro
 * alike.
 */
const props = defineProps({ trailer: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const vehiclesStore = useVehiclesStore()
vehiclesStore.init()

const form = reactive({ plate: '', name: '', compatibleTypes: [], notes: '' })

watch(() => props.trailer, trailer => {
  form.plate = trailer?.plate ?? ''
  form.name = trailer?.name ?? ''
  form.compatibleTypes = [...(trailer?.compatibleTypes ?? [])]
  form.notes = trailer?.notes ?? ''
}, { immediate: true })

/**
 * The models to tick: those of the fleet, named as the vehicles are, plus any
 * the trailer still lists although no vehicle bears that name any more — so
 * it can be seen, and unticked.
 */
const models = computed(() => {
  const fleet = fleetModels(vehiclesStore.vehicles)
  const known = new Set(fleet.map(modelKey))
  const gone = form.compatibleTypes.filter(name => !known.has(modelKey(name)))
  return [...fleet.map(name => ({ name, gone: false })), ...gone.map(name => ({ name, gone: true }))]
})

const ticked = name => form.compatibleTypes.some(item => modelKey(item) === modelKey(name))

function toggle(name) {
  form.compatibleTypes = ticked(name)
    ? form.compatibleTypes.filter(item => modelKey(item) !== modelKey(name))
    : [...form.compatibleTypes, name]
}

function submit() {
  if (!form.plate.trim()) return
  emit('save', { ...form, plate: form.plate.trim(), name: form.name.trim() })
}
</script>

<template>
  <BaseModal persistent :title="trailer ? $t('trailers.edit') : $t('trailers.new')" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="label" for="trailer-plate">{{ $t('trailers.plate') }} *</label>
          <input id="trailer-plate" v-model="form.plate" class="input" required
            :placeholder="$t('trailers.platePlaceholder')" />
        </div>
        <div>
          <label class="label" for="trailer-name">{{ $t('trailers.name') }}</label>
          <input id="trailer-name" v-model="form.name" class="input" :placeholder="$t('trailers.namePlaceholder')" />
        </div>
      </div>

      <fieldset>
        <legend class="label">{{ $t('trailers.compatibleTypes') }}</legend>
        <p class="text-xs text-stone-500 mb-2">{{ $t('trailers.compatibleHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <label v-for="model in models" :key="model.name"
            :class="['inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm min-h-[44px] cursor-pointer',
              ticked(model.name) ? 'border-olive-500 bg-olive-50 text-olive-800 font-medium' : 'border-stone-300']">
            <input type="checkbox" :checked="ticked(model.name)" @change="toggle(model.name)" />
            {{ model.name }}
            <span v-if="model.gone" class="text-xs text-stone-500 font-normal">{{ $t('trailers.notInFleet') }}</span>
          </label>
        </div>
        <p v-if="!models.length" class="text-sm text-amber-700">{{ $t('trailers.noTypes') }}</p>
      </fieldset>

      <div>
        <label class="label" for="trailer-notes">{{ $t('trailers.notes') }}</label>
        <textarea id="trailer-notes" v-model="form.notes" class="input" rows="2" />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ trailer ? $t('actions.save') : $t('actions.create') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
