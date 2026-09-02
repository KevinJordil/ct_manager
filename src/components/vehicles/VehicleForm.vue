<script setup>
import { reactive, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import { VEHICLE_CATEGORIES, VEHICLE_CATEGORY, VEHICLE_STATUS, STORED_VEHICLE_STATUSES } from '../../constants.js'

const props = defineProps({ vehicle: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const form = reactive({
  name: '',
  plate: '',
  seats: 4,
  category: VEHICLE_CATEGORY.LIGHT_ROAD,
  status: VEHICLE_STATUS.FREE,
  loanNote: '',
})

watch(() => props.vehicle, vehicle => {
  form.name = vehicle?.name ?? ''
  form.plate = vehicle?.plate ?? ''
  form.seats = vehicle?.seats ?? 4
  form.category = vehicle?.category ?? VEHICLE_CATEGORY.LIGHT_ROAD
  form.status = vehicle?.status ?? VEHICLE_STATUS.FREE
  form.loanNote = vehicle?.loanNote ?? ''
}, { immediate: true })

function submit() {
  if (!form.name.trim()) return
  if (form.status === VEHICLE_STATUS.ON_LOAN && !form.loanNote.trim()) return
  emit('save', {
    ...form,
    loanNote: form.status === VEHICLE_STATUS.ON_LOAN ? form.loanNote : '',
  })
}
</script>

<template>
  <BaseModal :title="vehicle ? $t('vehicles.edit') : $t('vehicles.new')" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <div>
        <label class="label" for="vehicle-name">{{ $t('vehicles.name') }} *</label>
        <input id="vehicle-name" v-model="form.name" class="input" :placeholder="$t('vehicles.namePlaceholder')" required />
      </div>

      <div>
        <label class="label" for="vehicle-plate">{{ $t('vehicles.plate') }}</label>
        <input id="vehicle-plate" v-model="form.plate" class="input" :placeholder="$t('vehicles.platePlaceholder')" />
      </div>

      <div>
        <label class="label" for="vehicle-seats">{{ $t('vehicles.seats') }}</label>
        <input id="vehicle-seats" v-model.number="form.seats" type="number" min="1" max="99" class="input"
          :placeholder="$t('vehicles.seatsPlaceholder')" />
      </div>

      <div>
        <label class="label" for="vehicle-category">{{ $t('vehicles.category') }}</label>
        <select id="vehicle-category" v-model="form.category" class="input">
          <option v-for="category in VEHICLE_CATEGORIES" :key="category" :value="category">
            {{ $t(`vehicles.categoryOptions.${category}`) }}
          </option>
        </select>
      </div>

      <div>
        <label class="label" for="vehicle-status">{{ $t('vehicles.status') }}</label>
        <select id="vehicle-status" v-model="form.status" class="input">
          <option v-for="status in STORED_VEHICLE_STATUSES" :key="status" :value="status">
            {{ $t(`status.${status}`) }}
          </option>
        </select>
      </div>

      <div v-if="form.status === 'on-loan'">
        <label class="label" for="vehicle-loan-note">{{ $t('vehicles.loan.note') }} *</label>
        <textarea id="vehicle-loan-note" v-model="form.loanNote" class="input" rows="2"
          :placeholder="$t('vehicles.loan.notePlaceholder')" required />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ vehicle ? $t('actions.save') : $t('actions.create') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
