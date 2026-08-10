<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-dialog-provider>
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }" :data-theme="currentThemeName">
        <div class="custom-titlebar" v-if="showMainTitlebar" data-tauri-drag-region>
          <div class="titlebar-left" data-tauri-drag-region>
            <img class="app-logo" src="/icon.png" alt="" aria-hidden="true">
            <div class="titlebar-title">Long编辑</div>
          </div>
          <div class="titlebar-right">
            <div class="window-controls">
              <div class="control win-btn minimize" @click="minimizeWindow"><svg width="10" height="1"><rect width="10" height="1" fill="currentColor"/></svg></div>
              <div class="control win-btn maximize" @click="maximizeWindow"><svg width="10" height="10"><path d="M0,0v10h10V0H0z M9,9H1V1h8V9z" fill="currentColor"/></svg></div>
              <div class="control win-btn close" @click="closeWindow"><svg width="10" height="10"><path d="M10,0.7L9.3,0L5,4.3L0.7,0L0,0.7L4.3,5L0,9.3L0.7,10L5,5.7L9.3,10L10,9.3L5.7,5L10,0.7z" fill="currentColor"/></svg></div>
            </div>
          </div>
        </div>
        <div class="app-content">
          <router-view v-slot="{ Component }">
            <div :key="$route.path" class="route-wrapper">
              <component :is="Component" />
            </div>
          </router-view>
          <FileRelationContext
            v-if="activeContextPath"
            :library-root="store.libraryPath"
            :file-path="activeContextPath"
            :focus-locator-kind="activeContextFocus?.locatorKind"
            :focus-locator-object-id="activeContextFocus?.locatorObjectId"
            :focus-locator-page="activeContextFocus?.locatorPage"
          />
          <div v-if="routeErrorMessage" class="route-error-notice" role="alert">
            <span>{{ routeErrorMessage }}</span>
            <button type="button" @click="reloadApplication">重新载入界面</button>
            <button type="button" class="route-error-close" title="关闭提示" aria-label="关闭提示" @click="routeErrorMessage = ''">×</button>
          </div>
        </div>
        <CommandPalette :show="showPalette" @close="showPalette = false" @execute="handleCommand" />
        <AppUpdater />

        <!-- 手写极简退出确认弹窗 (无侵入式) -->
        <transition name="modal-fade">
          <div v-if="showExitModal" class="exit-modal-overlay">
            <div class="exit-modal-card">
              <div class="modal-header">退出确认</div>
              <div class="modal-body">您想如何处理当前窗口？</div>
              <div class="modal-checkbox">
                <n-checkbox v-model:checked="dontAskAgain">不再提示，设为默认退出方式</n-checkbox>
              </div>
              <div class="modal-footer">
                <n-button quaternary @click="showExitModal = false">取消</n-button>
                <n-button secondary type="primary" @click="handleHide">最小化到托盘</n-button>
                <n-button secondary type="error" @click="handleExit">彻底退出</n-button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { darkTheme, useOsTheme, GlobalThemeOverrides } from 'naive-ui'
import { Window } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { listen, emit } from '@tauri-apps/api/event'
import CommandPalette from './components/CommandPalette.vue'
import FileRelationContext from './components/FileRelationContext.vue'
import AppUpdater from './components/AppUpdater.vue'
import { useAppStore } from './store/app'
import { findFileFormat, isExternallyOpenable, opensInLibraryShell, routeForFile } from './config/fileFormats'
import { getThemeTone, isDarkTheme, resolveThemeName } from './config/themePresets'
import { openManagedFile } from './services/fileNavigation'
import { externalRouteForFile } from './services/externalFileNavigation'
import { isTauriRuntime, withTimeout } from './services/tauriRuntime'

const osTheme = useOsTheme()
const router = useRouter()
const store = useAppStore()
const relationContextRoutes = new Set([
  'LibraryMode', 'TextEditor', 'JsonEditor', 'YamlEditor', 'XmlEditor', 'DrawioEditor', 'TomlEditor',
  'LogViewer', 'DocxEditor', 'OdtReader', 'OdfReader', 'PptxReader', 'Pdf', 'Table', 'Workbook',
  'Canvas', 'Diagram', 'MindMap',
])
const activeContextPath = computed(() => {
  const route = router.currentRoute.value
  if (route.query.external === '1') return ''
  return relationContextRoutes.has(String(route.name)) && typeof route.query.path === 'string'
    ? route.query.path
    : ''
})
const normalizeContextPath = (value: string) => value
  .replace(/^\\\\\?\\/, '')
  .replace(/\\/g, '/')
  .toLocaleLowerCase()
const activeContextFocus = computed(() => {
  const focus = store.relationObjectFocus
  return focus && normalizeContextPath(focus.path) === normalizeContextPath(activeContextPath.value)
    ? focus
    : null
})

const systemDark = computed(() => osTheme.value === 'dark')
const isDark = computed(() => isDarkTheme(store.theme, systemDark.value))
const activeTheme = computed(() => (isDark.value ? darkTheme : null))

// 是否显示主窗口标题栏（排除快速笔记窗口）
const showMainTitlebar = computed(() => {
  return !store.isZen && router.currentRoute.value.name !== 'QuickNote'
})

const currentThemeName = computed(() => resolveThemeName(store.theme, systemDark.value))
const currentThemeTone = computed(() => getThemeTone(store.theme, systemDark.value))

// 核心修复：将主题属性实时同步到 body 元素
watch(currentThemeName, (name) => {
  document.body.setAttribute('data-theme', name)
}, { immediate: true })

watch(() => store.visualStyle, (v) => {
  document.body.setAttribute('data-style', v)
}, { immediate: true })

watch(() => store.motionSpeed, (v) => {
  document.body.setAttribute('data-motion', v)
}, { immediate: true })

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    borderRadius: getComputedStyle(document.body).getPropertyValue('--theme-radius-sm').trim() || '8px',
    borderRadiusSmall: getComputedStyle(document.body).getPropertyValue('--theme-radius-sm').trim() || '6px',
    primaryColor: currentThemeTone.value.ui.primary,
    primaryColorHover: currentThemeTone.value.ui.primary,
    primaryColorPressed: currentThemeTone.value.ui.primary,
    textColor1: currentThemeTone.value.ui.text,
    textColor2: `${currentThemeTone.value.ui.text}c7`,
    textColor3: `${currentThemeTone.value.ui.text}8f`,
    borderColor: `${currentThemeTone.value.ui.text}26`,
    popoverColor: currentThemeTone.value.ui.surface,
    hoverColor: `${currentThemeTone.value.ui.primary}14`,
    bodyColor: 'transparent',
    cardColor: currentThemeTone.value.ui.surface,
    modalColor: currentThemeTone.value.ui.surface,
  },
  Select: {
    menuBoxShadow: `0 14px 36px ${currentThemeTone.value.ui.text}24`,
    peers: {
      InternalSelection: {
        textColor: currentThemeTone.value.ui.text,
        textColorDisabled: `${currentThemeTone.value.ui.text}70`,
        placeholderColor: `${currentThemeTone.value.ui.text}8f`,
        color: currentThemeTone.value.ui.surface,
        colorDisabled: currentThemeTone.value.ui.background,
        colorActive: currentThemeTone.value.ui.surface,
        border: `1px solid ${currentThemeTone.value.ui.text}26`,
        borderHover: `1px solid ${currentThemeTone.value.ui.primary}99`,
        borderActive: `1px solid ${currentThemeTone.value.ui.primary}`,
        borderFocus: `1px solid ${currentThemeTone.value.ui.primary}`,
        boxShadowFocus: `0 0 0 3px ${currentThemeTone.value.ui.primary}24`,
        arrowColor: `${currentThemeTone.value.ui.text}a8`,
        arrowColorDisabled: `${currentThemeTone.value.ui.text}52`,
      },
      InternalSelectMenu: {
        color: currentThemeTone.value.ui.surface,
        groupHeaderTextColor: `${currentThemeTone.value.ui.text}8f`,
        actionDividerColor: `${currentThemeTone.value.ui.text}20`,
        optionTextColor: currentThemeTone.value.ui.text,
        optionTextColorPressed: currentThemeTone.value.ui.primary,
        optionTextColorDisabled: `${currentThemeTone.value.ui.text}70`,
        optionTextColorActive: currentThemeTone.value.ui.primary,
        optionCheckColor: currentThemeTone.value.ui.primary,
        optionColorPending: `${currentThemeTone.value.ui.primary}14`,
        optionColorActive: `${currentThemeTone.value.ui.primary}1f`,
        optionColorActivePending: `${currentThemeTone.value.ui.primary}2b`,
      },
    },
  },
  Dropdown: {
    borderRadius: getComputedStyle(document.body).getPropertyValue('--theme-radius-sm').trim() || '7px',
    color: currentThemeTone.value.ui.surface,
    dividerColor: `${currentThemeTone.value.ui.text}20`,
    optionTextColor: currentThemeTone.value.ui.text,
    optionTextColorHover: currentThemeTone.value.ui.text,
    optionTextColorActive: currentThemeTone.value.ui.primary,
    optionTextColorChildActive: currentThemeTone.value.ui.primary,
    optionColorHover: `${currentThemeTone.value.ui.primary}14`,
    optionColorActive: `${currentThemeTone.value.ui.primary}1f`,
    groupHeaderTextColor: `${currentThemeTone.value.ui.text}8f`,
  },
}))

const showPalette = ref(false)
const showExitModal = ref(false)
const dontAskAgain = ref(false)
const routeErrorMessage = ref('')
let unlistenOpenFile: (() => void) | null = null
let routeMeasurementStartedAt = performance.now()
let routeMeasurementName = 'initial'
let routeMeasurementSequence = 0
performance.mark('longedit:route:initial:start')

declare global {
  interface Window {
    __LONGEDIT_ROUTE_PERFORMANCE__?: Array<{
      routeName: string
      elapsedMs: number
      recordedAt: string
    }>
    __LONGEDIT_EXPORT_ROUTE_PERFORMANCE__?: () => {
      schemaVersion: number
      capturedAt: string
      routeHistoryLimit: number
      routes: Array<{
        routeName: string
        elapsedMs: number
        recordedAt: string
      }>
      measures: Array<{
        name: string
        durationMs: number
        startTimeMs: number
      }>
    }
  }
}

const ROUTE_PERFORMANCE_MAX_ENTRIES = 20
window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__ = () => ({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  routeHistoryLimit: ROUTE_PERFORMANCE_MAX_ENTRIES,
  routes: [...(window.__LONGEDIT_ROUTE_PERFORMANCE__ ?? [])],
  measures: performance.getEntriesByType('measure')
    .filter(entry => entry.name.startsWith('longedit:route:'))
    .slice(-ROUTE_PERFORMANCE_MAX_ENTRIES)
    .map(entry => ({
      name: entry.name,
      durationMs: Math.round(entry.duration),
      startTimeMs: Math.round(entry.startTime),
    })),
})

const recordRoutePerformance = (routeName: string, elapsedMs: number) => {
  const entries = window.__LONGEDIT_ROUTE_PERFORMANCE__ ?? []
  entries.push({
    routeName,
    elapsedMs: Math.round(elapsedMs),
    recordedAt: new Date().toISOString(),
  })
  window.__LONGEDIT_ROUTE_PERFORMANCE__ = entries.slice(-ROUTE_PERFORMANCE_MAX_ENTRIES)
}

const startRouteMeasurement = (routeName?: unknown) => {
  routeMeasurementSequence += 1
  routeMeasurementStartedAt = performance.now()
  routeMeasurementName = String(routeName || 'unknown')
  performance.mark(`longedit:route:${routeMeasurementName}:start`)
}

const finishRouteMeasurement = (sequence = routeMeasurementSequence) => {
  if (sequence !== routeMeasurementSequence) return
  const totalElapsedMs = performance.now() - routeMeasurementStartedAt
  performance.mark(`longedit:route:${routeMeasurementName}:ready`)
  performance.measure(
    `longedit:route:${routeMeasurementName}`,
    `longedit:route:${routeMeasurementName}:start`,
    `longedit:route:${routeMeasurementName}:ready`,
  )
  recordRoutePerformance(routeMeasurementName, totalElapsedMs)
}

const removeBeforeEach = router.beforeEach((to) => {
  routeErrorMessage.value = ''
  startRouteMeasurement(to.name)
  if (to.name === 'LibraryMode' && typeof to.query.path !== 'string' && store.activeTabId) {
    return { name: 'LibraryMode', query: { ...to.query, path: store.activeTabId }, replace: true }
  }
  return true
})
const removeAfterEach = router.afterEach(() => {
  const sequence = routeMeasurementSequence
  let finished = false
  const finishOnce = () => {
    if (finished) return
    finished = true
    finishRouteMeasurement(sequence)
  }
  // Occluded WebView2 windows can suspend animation frames, so keep a bounded fallback.
  requestAnimationFrame(() => requestAnimationFrame(finishOnce))
  setTimeout(finishOnce, 250)
})
const removeRouteError = router.onError((cause, to) => {
  const target = typeof to?.fullPath === 'string' ? to.fullPath : '目标页面'
  routeErrorMessage.value = `无法打开 ${target}。当前文档仍然保留，可以重新载入界面后再试。`
  console.error('[Long编辑 Route Error]', cause)
})
const reloadApplication = () => window.location.reload()

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); showPalette.value = true }
  if (e.key === 'F11') { e.preventDefault(); store.toggleZen() }
}

const routeExternalFile = async (filePath: string) => {
  const cleanPath = filePath.replace(/^"|"$/g, '')
  const target = externalRouteForFile(cleanPath)
  if (target) await router.push(target)
}

const openExternalFile = async () => {
  const filePath = await invoke<string | null>('pick_external_openable_file')
  if (filePath) await routeExternalFile(filePath)
}

const handleCommand = async (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'zen-mode') store.toggleZen()
    else if (item.action === 'open-external-file') await openExternalFile()
    else if (item.action === 'export-html') emit('command-export')
    else if (item.action === 'save-file') emit('command-save')
    else if (item.action === 'refresh') emit('command-refresh')
    else if (item.action === 'daily-note') emit('command-daily-note')
    else if (item.action.startsWith('theme-preset:')) await store.applyThemePreset(item.action.slice('theme-preset:'.length))
  } else if (item.type === 'file') {
    const target = routeForFile(item.path)
    if (opensInLibraryShell(findFileFormat(item.path))) {
      openManagedFile(router, item.path)
    } else if (target) router.push(target)
  }
}

const appWindow = new Window('main')
const minimizeWindow = () => appWindow.minimize()
const maximizeWindow = async () => {
  const isMaximized = await appWindow.isMaximized()
  if (isMaximized) appWindow.unmaximize()
  else appWindow.maximize()
}
const closeWindow = async () => {
  // 识别当前路由：如果是临时编辑界面，关闭时应重置回到主库
  if (router.currentRoute.value.name === 'TempMode') {
    if (store.isTempDirty) {
      // 窗口关闭流程是同步的，必须用同步 confirm，async dialog 无法在此处工作
      if (!window.confirm('临时编辑中有未保存的修改，确定关闭吗？')) return
      store.isTempDirty = false
    }
    await router.push({ name: 'LibraryMode' })
  }

  if (store.exitStrategy === 'quit') {
    handleExit()
  } else if (store.exitStrategy === 'minimize') {
    handleHide()
  } else {
    showExitModal.value = true 
  }
}
const confirmDiscardUnsaved = () => {
  const dirtyCount = store.tabs.filter(tab => tab.isDirty).length + (store.isTempDirty ? 1 : 0)
  return dirtyCount === 0 || window.confirm(`仍有 ${dirtyCount} 个文档包含未保存修改，彻底退出后将丢失，是否继续？`)
}
const handleHide = () => { 
  if (dontAskAgain.value) {
    store.updateConfig({ exitStrategy: 'minimize' })
  }
  showExitModal.value = false; 
  appWindow.hide() 
}
const handleExit = () => { 
  if (!confirmDiscardUnsaved()) return
  if (dontAskAgain.value) {
    store.updateConfig({ exitStrategy: 'quit' })
  }
  invoke('exit_app') 
}

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!store.tabs.some(tab => tab.isDirty) && !store.isTempDirty) return
  event.preventDefault()
  event.returnValue = ''
}

const initializeExternalFileRouting = async () => {
  try {
    unlistenOpenFile = await withTimeout(listen<string>('open-file', async (event) => {
      const filePath = event.payload
      if (isExternallyOpenable(filePath)) await routeExternalFile(filePath)
    }), 2500, 'event:open-file')
  } catch (cause) {
    console.warn('Open-file event registration timed out', cause)
  }

  try {
    const args = await withTimeout(invoke<string[]>('get_launch_args'), 2500, 'invoke:get_launch_args')
    const filePath = args.find(arg => isExternallyOpenable(arg.replace(/^"|"$/g, '')))
    if (filePath) await routeExternalFile(filePath)
  } catch (cause) {
    console.warn('Launch arguments unavailable', cause)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  void store.loadConfig()
  if (isTauriRuntime()) void initializeExternalFileRouting()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (unlistenOpenFile) unlistenOpenFile()
  removeBeforeEach()
  removeAfterEach()
  removeRouteError()
})
</script>

<style>
/* Unified easing */
body { --ease-premium: cubic-bezier(0.16, 1, 0.3, 1); }

body {
  --titlebar-height: 32px;
  margin: 0; 
  padding: 0; 
  overflow: hidden; 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif; 
  background-color: var(--theme-bg) !important; 
  color: var(--theme-text);
  transition: background-color 0.4s var(--ease-premium), color 0.3s ease;
}

.app-container { height: 100vh; display: flex; flex-direction: column; background: transparent; position: relative; }

/* 退出弹窗 Simplaised */
.exit-modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
}
.exit-modal-card {
  background: var(--theme-bg);
  padding: 24px; border-radius: var(--theme-radius); width: 360px;
  border: var(--theme-border);
  box-shadow: var(--theme-shadow);
  text-align: center;
}
.modal-header { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.modal-body { font-size: 14px; opacity: 0.8; margin-bottom: 24px; }
.modal-checkbox { margin-bottom: 24px; display: flex; justify-content: center; }
.modal-footer { display: flex; gap: 8px; justify-content: center; }

.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.3s var(--ease-premium); }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.95); }

.custom-titlebar { 
  height: var(--titlebar-height); 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  background: color-mix(in srgb, var(--theme-surface) 88%, var(--theme-bg)); 
  backdrop-filter: none; 
  opacity: 0.98;
  user-select: none; 
  z-index: 9999; 
  border-bottom: var(--theme-border);
}

.titlebar-left { display: flex; align-items: center; padding-left: 16px; flex: 1; height: 100%; }
.app-logo { width: 18px; height: 18px; margin-right: 9px; border-radius: 4px; object-fit: cover; }
.titlebar-title { font-size: 11px; font-weight: 500; opacity: 0.5; }

.titlebar-right, .window-controls { display: flex; height: 100%; }
.win-btn { width: 44px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: default; transition: all 0.2s ease; color: currentColor; }
.win-btn:hover { background: rgba(0, 0, 0, 0.05); }
body[data-theme="dark"] .win-btn:hover, body[data-theme="contrast"] .win-btn:hover { background: rgba(255, 255, 255, 0.1); }
.win-btn.close:hover { background: #ff3b30 !important; color: #fff !important; }

.app-content { flex: 1; position: relative; overflow: hidden; }
.route-error-notice {
  position: absolute;
  z-index: 9000;
  top: 10px;
  left: 50%;
  width: min(680px, calc(100% - 32px));
  min-height: 38px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 12px;
  box-sizing: border-box;
  border: 1px solid var(--status-danger-border);
  border-radius: 6px;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  box-shadow: var(--workspace-shadow-md);
  transform: translateX(-50%);
  font-size: var(--text-compact);
}

.route-error-notice button {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid currentColor;
  border-radius: 5px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.route-error-notice .route-error-close {
  width: 28px;
  padding: 0;
  border-color: transparent;
  font-size: 18px;
}

.route-wrapper {
  width: 100%;
  height: 100%;
}

/* 隐藏 Vditor 浮动工具栏，提升专注感 */
.vditor-panel--focus, 
.vditor-ir__node { 
  display: none !important; 
  visibility: hidden !important; 
  opacity: 0 !important; 
  pointer-events: none !important; 
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: var(--theme-primary); border-radius: 20px; 
  border: 3px solid transparent; background-clip: content-box; opacity: 0.4;
}

/* Compact horizontal controls use wheel navigation instead of a native scrollbar track. */
[data-horizontal-wheel="always"] {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

[data-horizontal-wheel="always"]::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
</style>
