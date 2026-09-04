<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import { normaliseName } from '../../users.js'
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t, te } = useI18n()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!username.value || !password.value) return
  error.value = ''
  loading.value = true
  try {
    // A person signs in with their family name: "Müller" and "muller" are the
    // same login, and the administrator account is reached the same way.
    await auth.login(normaliseName(username.value), password.value)
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
  <div class="min-h-screen bg-stone-100 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="flex items-center justify-center gap-3 mb-8">
        <svg class="w-10 h-10 text-olive-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fill-rule="evenodd" d="M12 1.4C7.4 1.4 3.7 3.4 3.7 5.9S7.4 10.4 12 10.4s8.3-2 8.3-4.5S16.6 1.4 12 1.4zm0 2.3c3.1 0 5.6 1 5.6 2.2S15.1 8.1 12 8.1 6.4 7.1 6.4 5.9 8.9 3.7 12 3.7z"/><path d="M4.2 5h15.6v1.8H4.2z"/><path d="M11 6h2v15.2h-2z"/><path d="M3.2 10.4l7.3 3.1v2.7l-7.3-3.1zM20.8 10.4l-7.3 3.1v2.7l7.3-3.1z"/><path d="M5 15.2l5.5 2.3v2.6L5 17.8zM19 15.2l-5.5 2.3v2.6l5.5-2.3z"/>
        </svg>
        <span class="text-2xl font-bold text-stone-900">{{ $t('app.name') }}</span>
      </div>

      <div class="bg-white rounded-2xl shadow-md border border-stone-200 p-8">
        <h1 class="text-xl font-bold text-stone-900 mb-1">{{ $t('auth.title') }}</h1>
        <p class="text-sm text-stone-500 mb-6">{{ $t('auth.subtitle') }}</p>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="label" for="login-username">{{ $t('auth.nameOrUsername') }}</label>
            <input id="login-username" v-model="username" type="text" class="input"
              autocomplete="username" autocapitalize="none" spellcheck="false"
              autofocus :disabled="loading" />
          </div>

          <div>
            <label class="label" for="login-password">{{ $t('auth.password') }}</label>
            <input id="login-password" v-model="password" type="password" class="input"
              placeholder="••••••••" autocomplete="current-password" :disabled="loading" />
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
        <RouterLink to="/request" class="text-xs text-stone-400 hover:text-stone-600 underline">
          {{ $t('auth.makeRequest') }}
        </RouterLink>
        <LanguageSwitcher variant="light" />
      </div>
    </div>
  </div>
</template>
