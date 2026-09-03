<script setup>
import { ref, computed, watch } from 'vue'
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useClock } from './stores/clock.js'
import { useSync } from './stores/sync.js'
import { useAuthStore } from './stores/auth.js'
import { useRequestsStore } from './stores/requests.js'
import { localeTag } from './i18n/index.js'
import { formatLongDate, formatClock } from './i18n/formats.js'
import LanguageSwitcher from './components/common/LanguageSwitcher.vue'
import PasswordModal from './components/common/PasswordModal.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const requestsStore = useRequestsStore()
const { t, te, locale } = useI18n()
const sidebarOpen = ref(false)
const changingPassword = ref(false)

const { now } = useClock()
const { error: syncError, conflict, authRequired, saving, clearError } = useSync()

/** Public pages (login, request form) are rendered without the app shell. */
const isPublicPage = computed(() => Boolean(route.meta.public))
/** Printable documents carry their own layout, without the shell. */
const isBarePage = computed(() => Boolean(route.meta.bare))

// An expired or revoked session is only discovered on an API call: send the
// user back to the login page as soon as one reports it.
watch(authRequired, required => {
  if (!required) return
  auth.clear()
  if (!route.meta.public) {
    router.replace({ path: '/login', query: { redirect: route.fullPath } })
  }
})

// The pending count is shown as a badge in the sidebar. Loading it before
// the session exists would only produce a 401.
const shellVisible = computed(() => !isPublicPage.value && auth.isAuthenticated)
watch(shellVisible, visible => {
  if (visible) requestsStore.init()
}, { immediate: true })

/** Configuration and accounts are hidden from ordinary users. */
const visibleNavItems = computed(() =>
  NAV_ITEMS.filter(item => !item.admin || auth.isAdmin)
)

async function signOut() {
  await auth.logout()
  clearError()
  router.replace('/login')
}

const tag = computed(() => localeTag(locale.value))
const currentDate = computed(() => formatLongDate(now.value, tag.value))
const currentTime = computed(() => formatClock(now.value, tag.value))

/** Translates a key that may be absent, falling back to the raw value. */
function translateOrKeep(prefix, value) {
  const key = `${prefix}.${value}`
  return te(key) ? t(key) : value
}

/**
 * Errors are carried as a key plus parameters so they can be rendered in the
 * reader's language; entity and field names are themselves translated.
 */
const errorMessage = computed(() => {
  if (!syncError.value) return ''
  const { key, params } = syncError.value
  const resolved = { ...params }
  if (resolved.entity) resolved.entity = translateOrKeep('entities', resolved.entity)
  if (resolved.field) resolved.field = translateOrKeep('fields', resolved.field)
  if (resolved.list) resolved.list = translateOrKeep('fields', resolved.list)
  return te(key) ? t(key, resolved) : key
})

const showUnsavedHint = computed(() => syncError.value?.context === 'save')

function reloadPage() { window.location.reload() }

const NAV_ITEMS = [
  {
    to: '/',
    key: 'dashboard',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>`,
  },
  {
    to: '/persons',
    key: 'persons',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`,
  },
  {
    to: '/vehicles',
    key: 'vehicles',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7 0h6m-3-3v6"/>`,
  },
  {
    to: '/missions',
    key: 'missions',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>`,
  },
  {
    to: '/checks',
    key: 'checks',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>`,
  },
  {
    to: '/park',
    key: 'park',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>`,
  },
  {
    to: '/log',
    key: 'log',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>`,
  },
  {
    to: '/requests',
    key: 'requests',
    badge: () => requestsStore.pendingCount,
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>`,
  },
  {
    to: '/calendar',
    key: 'calendar',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>`,
  },
  {
    to: '/users',
    key: 'users',
    admin: true,
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>`,
  },
  {
    to: '/config',
    key: 'config',
    admin: true,
    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`,
  },
]
</script>

<template>
  <!-- Public and printable pages carry their own full-page layout. -->
  <RouterView v-if="isPublicPage || isBarePage" />

  <div v-else class="h-screen flex overflow-hidden">
    <!-- Mobile overlay -->
    <div v-if="sidebarOpen" class="fixed inset-0 bg-black/40 z-20 lg:hidden" @click="sidebarOpen = false" />

    <!-- Sidebar -->
    <aside :class="['fixed inset-y-0 left-0 z-30 w-64 h-full shrink-0 bg-gray-900 text-white flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto', sidebarOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="px-6 py-5 border-b border-gray-700">
        <div class="flex items-center gap-2">
          <svg class="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21h18M3 7v1a3 3 0 006 0V7m0 1a3 3 0 006 0V7m0 1a3 3 0 006 0V7M3 7l3-4h12l3 4M5 21V7"/>
          </svg>
          <span class="font-bold text-lg tracking-tight">{{ $t('app.name') }}</span>
        </div>
      </div>

      <nav class="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          @click="sidebarOpen = false"
          :class="['flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', (item.to === '/' ? route.path === '/' : route.path.startsWith(item.to)) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white']">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="item.icon" aria-hidden="true" />
          <span class="flex-1">{{ $t(`nav.${item.key}`) }}</span>
          <span v-if="item.badge && item.badge() > 0"
            class="shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
            {{ item.badge() }}
          </span>
        </RouterLink>
      </nav>

      <div class="px-3 pb-2 space-y-1">
        <button @click="changingPassword = true"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M5 8a8 8 0 001.921 5.191"/>
          </svg>
          <span class="flex-1 text-left truncate">{{ auth.username || $t('auth.account') }}</span>
        </button>

        <button @click="signOut"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          {{ $t('auth.logout') }}
        </button>
      </div>

      <div class="px-4 py-3 border-t border-gray-700 space-y-2">
        <p class="text-xs text-gray-500 px-2">{{ $t('app.tagline') }}</p>
        <LanguageSwitcher />
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0 h-full">
      <!-- Header -->
      <header class="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3 lg:hidden">
          <button @click="sidebarOpen = true" :aria-label="$t('app.openMenu')"
            class="-m-2 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span class="font-semibold text-gray-900">{{ $t('app.name') }}</span>
        </div>
        <div class="hidden lg:block" />
        <div class="flex items-center gap-4">
          <span v-if="saving" class="hidden sm:flex items-center gap-1.5 text-xs text-gray-400" role="status" aria-live="polite">
            <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {{ $t('app.saving') }}
          </span>
          <div class="text-right">
            <div class="text-xs font-medium text-gray-500">{{ currentDate }}</div>
            <div class="text-sm font-bold text-gray-800 tabular-nums">{{ currentTime }}</div>
          </div>
        </div>
      </header>

      <!-- Saves happen in the background: a failure has to be visible. -->
      <div v-if="syncError" role="alert"
        class="shrink-0 flex items-start gap-2 px-4 py-3 bg-red-600 text-white text-sm">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span class="flex-1">
          {{ errorMessage }}
          <template v-if="showUnsavedHint"> — {{ $t('errors.unsavedSuffix') }}</template>
        </span>
        <button v-if="conflict" @click="reloadPage"
          class="shrink-0 underline underline-offset-2 hover:no-underline">
          {{ $t('actions.reload') }}
        </button>
        <button @click="clearError" class="shrink-0 underline underline-offset-2 hover:no-underline">
          {{ $t('actions.hide') }}
        </button>
      </div>

      <PasswordModal v-if="changingPassword" @close="changingPassword = false" />

      <main class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style>
/* Global utility classes */
.page-title { @apply text-2xl font-bold text-gray-900 mb-6; }
.section-title { @apply text-base font-semibold text-gray-700 mb-3; }
.card { @apply bg-white rounded-xl border border-gray-200 p-4 shadow-sm; }
.input { @apply w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors; }
.label { @apply block text-sm font-medium text-gray-700 mb-1; }
.btn-primary { @apply inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors; }
.btn-secondary { @apply inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors; }
.btn-danger { @apply inline-flex items-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors; }
/* The icon keeps its size; the button around it is sized so the target is
   comfortable on a touch screen. Not conditioned on a media query: pointer
   detection is unreliable, and a 36px target harms nothing with a mouse. */
.icon-btn { @apply inline-flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors; }
.badge-gray { @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700; }

.stat-card { @apply rounded-xl p-4 text-center; }
.stat-green { @apply bg-green-50 border border-green-200; }
.stat-orange { @apply bg-orange-50 border border-orange-200; }
.stat-red { @apply bg-red-50 border border-red-200; }
.stat-value { @apply text-3xl font-bold; }
.stat-label { @apply text-sm font-medium mt-1; }
.stat-green .stat-value { @apply text-green-700; }
.stat-green .stat-label { @apply text-green-600; }
.stat-orange .stat-value { @apply text-orange-700; }
.stat-orange .stat-label { @apply text-orange-600; }
.stat-red .stat-value { @apply text-red-700; }
.stat-red .stat-label { @apply text-red-600; }

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.list-enter-active, .list-leave-active { transition: all 0.2s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
