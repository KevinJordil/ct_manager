import { createRouter, createWebHashHistory } from 'vue-router'
import { hasSessionToken } from '../api.js'
import { useAuthStore } from '../stores/auth.js'
import DashboardView from '../views/DashboardView.vue'
import PersonsView from '../views/PersonsView.vue'
import VehiclesView from '../views/VehiclesView.vue'
import MissionsView from '../views/MissionsView.vue'
import CalendarView from '../views/CalendarView.vue'
import LoginView from '../views/LoginView.vue'
import RequestView from '../views/RequestView.vue'
import RequestsView from '../views/RequestsView.vue'
import ParkView from '../views/ParkView.vue'
import ChecksView from '../views/ChecksView.vue'
import ConfigView from '../views/ConfigView.vue'
import UsersView from '../views/UsersView.vue'
import PrintView from '../views/PrintView.vue'

const routes = [
  // ── Public ──
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/request', name: 'request', component: RequestView, meta: { public: true } },

  // ── Behind the login ──
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/persons', name: 'persons', component: PersonsView },
  { path: '/vehicles', name: 'vehicles', component: VehiclesView },
  { path: '/missions', name: 'missions', component: MissionsView },
  { path: '/calendar', name: 'calendar', component: CalendarView },
  { path: '/requests', name: 'requests', component: RequestsView },
  { path: '/park', name: 'park', component: ParkView },
  { path: '/checks', name: 'checks', component: ChecksView },
  { path: '/print', name: 'print', component: PrintView, meta: { bare: true } },

  // ── Administrators only ──
  { path: '/config', name: 'config', component: ConfigView, meta: { admin: true } },
  { path: '/users', name: 'users', component: UsersView, meta: { admin: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/**
 * Authentication is judged on the presence of a token, not its validity:
 * checking with the server on every navigation would add a round trip, and an
 * expired token is caught by the first API call, which sends the user back
 * here. The role, however, has to be known, so the account is fetched once.
 */
router.beforeEach(async to => {
  const signedIn = hasSessionToken()
  if (!to.meta.public && !signedIn) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && signedIn) return '/'

  if (to.meta.admin) {
    const auth = useAuthStore()
    if (!auth.user) await auth.verify()
    if (!auth.isAdmin) return '/'
  }
})

export default router
