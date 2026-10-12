import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerNaiveComponents } from './services/naiveComponents'
import App from './App.vue'
import router from './router'
import { useAppStore } from './store/app'
import { managedFileLocation } from './services/fileNavigation'
import { installRecoverableLayoutErrorBoundary } from './services/recoverableRuntimeErrors'
import { installHorizontalWheelNavigation } from './services/horizontalWheel'
import { installContextMenuPolicy } from './services/contextMenuPolicy'
import { installAppTooltipPolicy } from './services/appTooltipPolicy'
import { withTimeout } from './services/tauriRuntime'
import { showRuntimeErrorNotice } from './services/runtimeErrorNotice'

import 'vfonts/Inter.css'
import 'vfonts/FiraCode.css'
import './styles/tokens.scss'
import './styles/themes.scss'
import './styles/motion.scss'
import './styles/vditor-content-themes.scss'
import './styles/display-preferences.scss'
import './styles/workflow-surfaces.scss'

const removeRecoverableLayoutErrorBoundary = installRecoverableLayoutErrorBoundary()
const removeHorizontalWheelNavigation = installHorizontalWheelNavigation()
const removeContextMenuPolicy = installContextMenuPolicy()
const removeAppTooltipPolicy = installAppTooltipPolicy()
import.meta.hot?.dispose(() => {
  removeRecoverableLayoutErrorBoundary()
  removeHorizontalWheelNavigation()
  removeContextMenuPolicy()
  removeAppTooltipPolicy()
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
const store = useAppStore(pinia)

registerNaiveComponents(app)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Long编辑 Error]', err, '\nInfo:', info)

  showRuntimeErrorNotice(err, () => { void router.push({ name: 'Settings', query: { category: 'library' } }) })
}

const bootstrap = async () => {
  app.use(router)
  app.mount('#app')
  await store.loadConfig()
  try {
    await withTimeout(router.isReady(), 8000, 'router:isReady')
    if (router.currentRoute.value.name === 'LibraryMode' && typeof router.currentRoute.value.query.path !== 'string' && store.activeTabId) {
      await router.replace(managedFileLocation(store.activeTabId, router.currentRoute.value.query))
    }
  } catch (cause) {
    console.error('[Long编辑 Bootstrap Recovery]', cause)
  }
}

void bootstrap()
