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

  const appEl = document.getElementById('app')
  if (appEl && !appEl.querySelector('.crash-fallback')) {
    const fallback = document.createElement('div')
    fallback.className = 'crash-fallback'
    fallback.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;padding:40px;text-align:center'
    fallback.innerHTML = `
      <h2 style="margin-bottom:12px">出现错误</h2>
      <p style="opacity:0.6;margin-bottom:24px">应用遇到了意外问题，请尝试刷新页面或重启应用。</p>
      <button onclick="location.reload()" style="padding:8px 24px;border-radius:8px;border:none;background:var(--theme-primary,#007aff);color:#fff;cursor:pointer;font-size:14px">刷新应用</button>
      <details style="margin-top:20px;max-width:600px;text-align:left;opacity:0.5">
        <summary>错误详情</summary>
        <pre style="font-size:12px;overflow:auto;margin-top:8px">${String(err)}</pre>
      </details>
    `
    appEl.appendChild(fallback)
  }
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
