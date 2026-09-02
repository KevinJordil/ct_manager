<script setup>
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { setAccessKey } from '../../api.js'

const emit = defineEmits(['close'])
const key = ref('')

function submit() {
  if (!key.value.trim()) return
  setAccessKey(key.value.trim())
  // Safest after a key change: start from a clean slate, since every
  // collection has to be reloaded.
  window.location.reload()
}
</script>

<template>
  <BaseModal :title="$t('accessKey.title')" @close="emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <i18n-t keypath="accessKey.description" tag="p" class="text-sm text-gray-600" scope="global">
        <template #variable>
          <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">CT_TOKEN</code>
        </template>
      </i18n-t>
      <div>
        <label class="label" for="access-key">{{ $t('accessKey.label') }}</label>
        <input id="access-key" v-model="key" type="password" class="input"
          autocomplete="current-password" :placeholder="$t('accessKey.placeholder')" required />
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ $t('actions.validate') }}</button>
      </div>
    </form>
  </BaseModal>
</template>
