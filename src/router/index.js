import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import PersonsView from '../views/PersonsView.vue'
import VehiclesView from '../views/VehiclesView.vue'
import MissionsView from '../views/MissionsView.vue'
import CalendarView from '../views/CalendarView.vue'

const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/persons', name: 'persons', component: PersonsView },
  { path: '/vehicles', name: 'vehicles', component: VehiclesView },
  { path: '/missions', name: 'missions', component: MissionsView },
  { path: '/calendar', name: 'calendar', component: CalendarView },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
