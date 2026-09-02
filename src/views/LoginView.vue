<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t, te } = useI18n()

const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!password.value) return
  error.value = ''
  loading.value = true
  try {
    await auth.login(password.value)
    // Return to the page that was asked for before the redirect, if any.
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(target)
  } catch (err) {
    const key = err.code ? `server.${err.code}` : null
    error.value = key && te(key) ? t(key) : (err.message || t('server.internal'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="flex items-center justify-center gap-3 mb-8">
        <svg class="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 21h18M3 7v1a3 3 0 006 0V7m0 1a3 3 0 006 0V7m0 1a3 3 0 006 0V7M3 7l3-4h12l3 4M5 21V7"/>
        </svg>
        <span class="text-2xl font-bold text-gray-900">{{ $t('app.name') }}</span>
      </div>

      <div class="bg-white rounded-2xl shadow-md border border-gray-200 p-8">
        <h1 class="text-xl font-bold text-gray-900 mb-1">{{ $t('auth.title') }}</h1>
        <p class="text-sm text-gray-500 mb-6">{{ $t('auth.subtitle') }}</p>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="label" for="login-password">{{ $t('auth.password') }}</label>
            <input id="login-password" v-model="password" type="password" class="input"
              placeholder="••••••••" autocomplete="current-password" autofocus :disabled="loading" />
          </div>

          <p v-if="error" role="alert"
            class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ error }}
          </p>

          <button type="submit" class="btn-primary w-full justify-center" :disabled="loading">
            <svg v-if="loading" class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {{ $t('auth.submit') }}
          </button>
        </form>
      </div>

      <div class="flex items-center justify-between mt-4">
        <RouterLink to="/request" class="text-xs text-gray-400 hover:text-gray-600 underline">
          {{ $t('auth.makeRequest') }}
        </RouterLink>
        <LanguageSwitcher variant="light" />
      </div>
    </div>
  </div>
</template>
