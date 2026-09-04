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
import BattleLogView from '../views/BattleLogView.vue'
import MyMissionsView from '../views/MyMissionsView.vue'
import ConfigView from '../views/ConfigView.vue'
import UsersView from '../views/UsersView.vue'
import PermissionsView from '../views/PermissionsView.vue'
import PrintView from '../views/PrintView.vue'

const routes = [
  // ── Public ──
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/request', name: 'request', component: RequestView, meta: { public: true } },

  // ── Behind the login ──
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/my-missions', name: 'my-missions', component: MyMissionsView },
  { path: '/persons', name: 'persons', component: PersonsView },
  { path: '/vehicles', name: 'vehicles', component: VehiclesView },
  { path: '/missions', name: 'missions', component: MissionsView },
  { path: '/calendar', name: 'calendar', component: CalendarView },
  { path: '/requests', name: 'requests', component: RequestsView },
  { path: '/park', name: 'park', component: ParkView },
  { path: '/checks', name: 'checks', component: ChecksView },
  { path: '/log', name: 'log', component: BattleLogView },
  { path: '/print', name: 'print', component: PrintView, meta: { bare: true } },

  // ── Administrators only ──
  { path: '/config', name: 'config', component: ConfigView, meta: { admin: true } },
  { path: '/users', name: 'users', component: UsersView, meta: { admin: true } },
  { path: '/permissions', name: 'permissions', component: PermissionsView, meta: { admin: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/**
 * No token, no protected page. When there is one, the account is read from
 * the server once per page load — which both validates the session and gives
 * the role. Later navigations reuse it, so this costs one request, not one
 * per move.
 */
router.beforeEach(async to => {
  const signedIn = hasSessionToken()
  if (!to.meta.public && !signedIn) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && signedIn) return '/'

  if (!to.meta.public) {
    // A stored token proves nothing: the server keeps sessions in memory, so
    // a restart leaves every browser holding one it no longer knows. Settle
    // that here, before the page mounts and its stores fire loads that would
    // all fail at once.
    const auth = useAuthStore()
    if (!auth.user && !await auth.verify()) {
      return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
    }
    if (to.meta.admin && !auth.isAdmin) return '/'
  }
})

export default router
