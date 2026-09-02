import { createRouter, createWebHashHistory } from 'vue-router'
import { hasSessionToken } from '../api.js'
import DashboardView from '../views/DashboardView.vue'
import PersonsView from '../views/PersonsView.vue'
import VehiclesView from '../views/VehiclesView.vue'
import MissionsView from '../views/MissionsView.vue'
import CalendarView from '../views/CalendarView.vue'
import LoginView from '../views/LoginView.vue'
import RequestView from '../views/RequestView.vue'
import RequestsView from '../views/RequestsView.vue'

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
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/**
 * Guard based on the presence of a token, not on its validity: checking with
 * the server on every navigation would add a round trip. An expired token is
 * caught by the first API call, which sends the user back here.
 */
router.beforeEach(to => {
  const signedIn = hasSessionToken()
  if (!to.meta.public && !signedIn) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && signedIn) return '/'
})

export default router
