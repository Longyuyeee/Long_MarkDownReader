import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  NButton,
  NButtonGroup,
  NCheckbox,
  NColorPicker,
  NConfigProvider,
  NDialogProvider,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputGroup,
  NInputNumber,
  NMessageProvider,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  NTree,
} from 'naive-ui'
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

const naiveComponents = {
  NButton,
  NButtonGroup,
  NCheckbox,
  NColorPicker,
  NConfigProvider,
  NDialogProvider,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputGroup,
  NInputNumber,
  NMessageProvider,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  NTree,
}

for (const [name, component] of Object.entries(naiveComponents)) {
  app.component(name, component)
}

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
