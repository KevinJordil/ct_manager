<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from './BaseModal.vue'
import { useAuthStore } from '../../stores/auth.js'

const emit = defineEmits(['close'])
const auth = useAuthStore()
const { t, te } = useI18n()

const current = ref('')
const next = ref('')
const confirmation = ref('')
const error = ref('')
const done = ref(false)
const saving = ref(false)

const mismatch = computed(() =>
  Boolean(next.value && confirmation.value && next.value !== confirmation.value)
)

const canSubmit = computed(() =>
  Boolean(current.value) && Boolean(next.value) && !mismatch.value
)

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  saving.value = true
  try {
    await auth.changePassword(current.value, next.value)
    done.value = true
  } catch (err) {
    const key = err.code ? `server.${err.code}` : null
    error.value = key && te(key) ? t(key, err.params ?? {}) : (err.message || t('server.internal'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :title="$t('auth.changePassword')" @close="emit('close')">
    <div v-if="done" class="space-y-4">
      <p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2" role="status">
        {{ $t('auth.passwordChanged') }}
      </p>
      <div class="flex justify-end">
        <button @click="emit('close')" class="btn-primary">{{ $t('actions.close') }}</button>
      </div>
    </div>

    <form v-else @submit.prevent="submit" class="space-y-4">
      <div>
        <label class="label" for="current-password">{{ $t('auth.currentPassword') }}</label>
        <input id="current-password" v-model="current" type="password" class="input"
          autocomplete="current-password" required />
      </div>
      <div>
        <label class="label" for="new-password">{{ $t('auth.newPassword') }}</label>
        <input id="new-password" v-model="next" type="password" class="input"
          autocomplete="new-password" required />
      </div>
      <div>
        <label class="label" for="confirm-password">{{ $t('auth.confirmPassword') }}</label>
        <input id="confirm-password" v-model="confirmation" type="password" class="input"
          autocomplete="new-password" required />
        <p v-if="mismatch" class="mt-1 text-xs text-red-600">{{ $t('auth.passwordMismatch') }}</p>
      </div>

      <p v-if="error" role="alert"
        class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {{ error }}
      </p>

      <div class="flex justify-end gap-3 pt-1">
        <button type="button" @click="emit('close')" class="btn-secondary">{{ $t('actions.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saving || !canSubmit">
          {{ $t('actions.save') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
