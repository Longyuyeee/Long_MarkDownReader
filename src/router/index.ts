import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/library'
  },
  {
    path: '/temp',
    name: 'TempMode',
    component: () => import('../views/TempMode.vue')
  },
  {
    path: '/library',
    name: 'LibraryMode',
    component: () => import('../views/LibraryMode.vue')
  },
  {
    path: '/quick-note',
    name: 'QuickNote',
    component: () => import('../views/QuickNote.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
