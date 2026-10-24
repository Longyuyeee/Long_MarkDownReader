<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-dialog-provider>
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }" :data-theme="currentThemeName" :data-window-role="windowRole">
        <div class="custom-titlebar" v-if="showMainTitlebar" data-tauri-drag-region>
          <div class="titlebar-left" data-tauri-drag-region>
            <img class="app-logo" src="/icon.png" alt="" aria-hidden="true">
            <div class="titlebar-title">{{ windowTitle }}</div>
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
          <AppNavigation v-if="isMainWindow && router.currentRoute.value.name !== 'QuickNote' && !store.isZen" />
          <div class="app-route-content">
          <router-view v-slot="{ Component }">
            <div :key="$route.path" class="route-wrapper">
              <WorkspaceErrorBoundary :reset-key="$route.fullPath" :initial-error="Component ? '' : routeErrorMessage" @error="handleWorkspaceError" @home="openRecoveryPage('WorkspaceHome')" @settings="openRecoveryPage('Settings')" @retry="retryFailedRoute">
                <component :is="Component" />
              </WorkspaceErrorBoundary>
            </div>
          </router-view>
          <FileRelationContext
            v-if="activeContextPath"
            :menu-entry="router.currentRoute.value.name === 'LibraryMode' && !store.isZen"
            :library-root="store.libraryPath"
            :file-path="activeContextPath"
            :focus-locator-kind="activeContextFocus?.locatorKind"
            :focus-locator-object-id="activeContextFocus?.locatorObjectId"
            :focus-locator-page="activeContextFocus?.locatorPage"
          />
          <div v-if="routeErrorMessage" class="route-error-notice" role="alert">
            <span>{{ routeErrorMessage }}</span>
            <button v-if="failedRouteTarget" type="button" @click="retryFailedRoute">重试打开</button>
            <button type="button" class="route-error-close" title="关闭提示" aria-label="关闭提示" @click="routeErrorMessage = ''">×</button>
          </div>
          </div>
        </div>
        <CommandPalette :show="showPalette" @close="showPalette = false" @execute="handleCommand" />
        <FileRelationDialog />
        <AppUpdater v-if="isMainWindow" />

        <!-- 手写极简退出确认弹窗 (无侵入式) -->
        <transition name="modal-fade">
          <div v-if="isMainWindow && showExitModal" class="exit-modal-overlay">
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
        <transition name="modal-fade">
          <div v-if="showDiscardConfirm" class="exit-modal-overlay" @click.self="resolveDiscardConfirm(false)">
            <div class="exit-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="discard-confirm-title" aria-describedby="discard-confirm-content">
              <div id="discard-confirm-title" class="modal-header">{{ discardConfirmTitle }}</div>
              <div id="discard-confirm-content" class="modal-body">{{ discardConfirmContent }}</div>
              <div class="modal-footer">
                <n-button quaternary @click="resolveDiscardConfirm(false)">取消</n-button>
                <n-button secondary type="error" @click="resolveDiscardConfirm(true)">放弃修改并继续</n-button>
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
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { emit, emitTo, type UnlistenFn } from '@tauri-apps/api/event'
import CommandPalette from './components/CommandPalette.vue'
import FileRelationContext from './components/FileRelationContext.vue'
import FileRelationDialog from './components/FileRelationDialog.vue'
import AppUpdater from './components/AppUpdater.vue'
import AppNavigation from './components/AppNavigation.vue'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary.vue'
import { showRuntimeErrorNotice } from './services/runtimeErrorNotice'
import { useAppStore } from './store/app'
import { findFileFormat, opensInLibraryShell, routeForFile } from './config/fileFormats'
import { getThemeTone, isDarkTheme, resolveThemeName } from './config/themePresets'
import { normalizeDisplayPreferences, documentTypographyStyle, VISUAL_STYLE_RADII } from './config/displayPreferences'
import { openManagedFile, openManagedObject } from './services/fileNavigation'
import { windowDraftCount, windowDraftActivity, windowReferenceDrafts } from './services/windowDrafts'
import { createFileMoveProtection, canRetainMovedDraft, movedPath, pathsOverlap, type FileMoveNotice } from './services/fileMoveProtection'
import { continueFileReading } from './services/fileReadingContinuity'
import { createSerialDraftReporter } from './utils/serialDraftReports'
import { isTauriRuntime } from './services/tauriRuntime'

const osTheme = useOsTheme()
const router = useRouter()
const store = useAppStore()
const appWindow = isTauriRuntime() ? getCurrentWindow() : null
const isMainWindow = appWindow ? appWindow.label === 'main' : true
const windowRole = isMainWindow ? 'main' : 'external'
const windowTitle = computed(() => {
  if (isMainWindow) return 'Long编辑'
  const path = String(router.currentRoute.value.query.path || '')
  return path.split(/[\\/]/).pop() || '外部文件'
})
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

watch(() => store.displayPreferences, (value) => {
  const preferences = normalizeDisplayPreferences(value)
  for (const key of ['documentStyle', 'documentFont', 'fileDensity', 'fileRowStyle', 'fileIconStyle'] as const) {
    const attribute = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
    document.body.setAttribute(`data-${attribute}`, preferences[key])
  }
  for (const [key, value] of Object.entries(documentTypographyStyle(preferences))) {
    if (value) document.body.style.setProperty(key, value)
    else document.body.style.removeProperty(key)
  }
}, { immediate: true, deep: true })

const styleRadii = computed(() => VISUAL_STYLE_RADII[store.visualStyle] || VISUAL_STYLE_RADII.soft)

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    borderRadius: styleRadii.value.normal,
    borderRadiusSmall: styleRadii.value.small,
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
    borderRadius: styleRadii.value.small,
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
const openCommandPalette = () => { showPalette.value = true }
const showExitModal = ref(false)
const showDiscardConfirm = ref(false)
const discardConfirmTitle = ref('放弃未保存修改？')
const discardConfirmContent = ref('未保存内容将无法恢复。')
let discardConfirmResolver: ((confirmed: boolean) => void) | null = null
const dontAskAgain = ref(false)
const routeErrorMessage = ref('')
const failedRouteTarget = ref('')
const openRecoveryPage = (name: string) => {
  void router.push({ name, ...(name === 'Settings' ? { query: { category: 'library' } } : {}) }).catch(error => handleWorkspaceError(error, false))
}
const handleWorkspaceError = (error: unknown, blocking: boolean) => {
  console.error('[Long编辑 Workspace Error]', error)
  if (!blocking) showRuntimeErrorNotice(error, () => openRecoveryPage('Settings'), () => openRecoveryPage('LibraryMode'))
}
const retryFailedRoute = () => {
  if (!failedRouteTarget.value) return
  const target = failedRouteTarget.value
  routeErrorMessage.value = ''
  void router.push(target).catch(error => handleWorkspaceError(error, false))
}
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

const removeBeforeEach = router.beforeEach(async (to) => {
  routeErrorMessage.value = ''
  failedRouteTarget.value = ''
  startRouteMeasurement(to.name)
  if (!isMainWindow && to.name === 'LibraryMode') {
    await closeWindow()
    return false
  }
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
  failedRouteTarget.value = typeof to?.fullPath === 'string' ? to.fullPath : ''
  routeErrorMessage.value = '目标页面暂时无法打开。当前页面仍可使用，可以重试或选择其他页面。'
  console.error('[Long编辑 Route Error]', cause)
})

// Reserve the advertised application shortcut before embedded editors handle it.
const handlePaletteKeydown = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'p') return
  e.preventDefault(); e.stopImmediatePropagation(); openCommandPalette()
}
const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'F11') { e.preventDefault(); store.toggleZen() }
}

const openExternalFile = async () => {
  const filePath = await invoke<string | null>('pick_external_openable_file')
  if (filePath) await invoke<string>('open_external_file_window', { path: filePath })
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
      if (item.locatorKind || item.annotationId || ['pdf', 'workbook', 'docx', 'odt', 'ods', 'odp', 'pptx'].includes(item.objectType)) {
        await openManagedObject(router, { path: item.path, objectType: item.objectType, locator: { kind: item.locatorKind, objectId: item.locatorObjectId, page: item.page }, page: item.page, annotationId: item.annotationId, locationLabel: item.locationLabel, matchKind: item.matchKind })
        return
      }
    const target = routeForFile(item.path)
    if (opensInLibraryShell(findFileFormat(item.path))) {
        openManagedFile(router, item.path, item.searchNeedle ? { searchNeedle: item.searchNeedle, searchLocator: String(Date.now()) } : {})
    } else if (target) router.push(target)
  }
}

const minimizeWindow = () => appWindow?.minimize()
const maximizeWindow = async () => {
  if (!appWindow) return
  const isMaximized = await appWindow.isMaximized()
  if (isMaximized) appWindow.unmaximize()
  else appWindow.maximize()
}
let closeBusy = false
let lifecycleReady = false
let lifecycleDisposed = false
const lifecycleUnlisteners: UnlistenFn[] = []
const closeWindow = async () => {
  if (!lifecycleReady || closeBusy || store.isCaptureBusy) return
  closeBusy = true
  try {
    if (!isMainWindow) {
      if (await confirmDiscardUnsaved('关闭当前窗口？')) await appWindow?.destroy()
    } else if (store.exitStrategy === 'quit') {
      await handleExit()
    } else if (store.exitStrategy === 'minimize') {
      await handleHide()
    } else {
      showExitModal.value = true
    }
  } catch (error) {
    routeErrorMessage.value = `关闭失败，请重试：${String(error)}`
  } finally {
    closeBusy = false
  }
}
const resolveDiscardConfirm = (confirmed: boolean) => {
  showDiscardConfirm.value = false
  const resolver = discardConfirmResolver
  discardConfirmResolver = null
  resolver?.(confirmed)
}
const requestDiscardConfirm = (title: string, content: string) => {
  if (showDiscardConfirm.value) return Promise.resolve(false)
  discardConfirmTitle.value = title
  discardConfirmContent.value = content
  showDiscardConfirm.value = true
  return new Promise<boolean>(resolve => { discardConfirmResolver = resolve })
}
const confirmDiscardUnsaved = (title = '退出 Long编辑？') => {
  const dirtyCount = store.tabs.filter(tab => tab.isDirty).length + (store.isTempDirty ? 1 : 0) + windowDraftCount.value
  return dirtyCount === 0
    ? Promise.resolve(true)
    : requestDiscardConfirm(title, '仍有文档包含未保存修改，继续后这些内容将无法恢复。')
}
const handleHide = async () => {
  try {
    if (dontAskAgain.value) await store.updateConfig({ exitStrategy: 'minimize' })
    await appWindow?.hide()
    showExitModal.value = false
  } catch (error) {
    routeErrorMessage.value = `最小化失败，请重试：${String(error)}`
  }
}
let exitBusy = false
const handleExit = async () => {
  if (!lifecycleReady || exitBusy || store.isCaptureBusy) return
  exitBusy = true
  try {
    showExitModal.value = false
    if (!await confirmDiscardUnsaved()) return
    if (dontAskAgain.value) await store.updateConfig({ exitStrategy: 'quit' })
    await invoke('exit_app')
  } catch (error) {
    routeErrorMessage.value = String(error)
  } finally {
    exitBusy = false
  }
}
const hasUnsavedChanges = computed(() => store.tabs.some(tab => tab.isDirty) || store.isTempDirty || windowDraftCount.value > 0)
const moveProtection = createFileMoveProtection({
  ready: () => lifecycleReady && !lifecycleDisposed,
  activePath: () => String(router.currentRoute.value.query.path || store.activeTabId || ''),
  retainedDraftPaths: request => store.tabs.filter(tab => tab.isDirty && tab.content !== undefined && canRetainMovedDraft(tab.path, request, findFileFormat) && (findFileFormat(tab.path)?.routeName !== 'TextEditor' || Boolean(tab.textSignature)) && !(store.isTempDirty && pathsOverlap(tab.path, String(router.currentRoute.value.query.path || '')))).map(tab => tab.path),
  referenceDrafts: () => [...store.tabs.filter(tab => tab.isDirty && findFileFormat(tab.path)?.id === 'markdown').map(tab => ({ path: tab.path, content: tab.content })), ...windowReferenceDrafts()],
  dirtyPaths: () => [...store.tabs.filter(tab => tab.isDirty).map(tab => tab.path), ...(store.isTempDirty ? [String(router.currentRoute.value.query.path || '')] : [])],
  completed: async notice => {
    if (continueFileReading(notice)) routeErrorMessage.value = '文件位置已更新；部分阅读记录未能接续，原记录仍保留。当前文稿可继续使用。'
    for (const tab of store.tabs) {
      const path = movedPath(tab.path, notice)
      if (path !== tab.path) { tab.path = path; tab.id = path; tab.title = path.split(/[\\/]/).pop() || tab.title }
      if (!tab.isDirty && notice.documents.some(document => pathsOverlap(document, tab.path))) {
        tab.content = undefined; tab.textSignature = undefined; tab.textContentDigest = undefined
      }
    }
    if (!notice.contentOnly) {
      if (store.activeTabId) store.activeTabId = movedPath(store.activeTabId, notice)
      store.starredFiles = store.starredFiles.map(path => movedPath(path, notice))
      store.recentFiles = store.recentFiles.map(item => ({ ...item, path: movedPath(item.path, notice) }))
      try { await store.moveFileDisplayStyles(notice.oldPath, notice.newPath) } catch (error) { console.warn('文件位置已更新，显示设置稍后重试', error) }
    }
    store.saveTabsState()
    const route = router.currentRoute.value, path = typeof route.query.path === 'string' ? route.query.path : ''
    const nextPath = path ? movedPath(path, notice) : ''
    if (nextPath && nextPath !== path) await router.replace({ query: { ...route.query, path: nextPath } })
    const pending: Promise<unknown>[] = []
    window.dispatchEvent(new CustomEvent('longedit:file-move-completed', { detail: { notice, pending } }))
    await Promise.all(pending)
  },
})
let draftSession: string | null = null
let draftSequence = 0
const sendDraftReport = createSerialDraftReporter(report => invoke<void>('report_window_draft_session', { ...report }))
const reportDraftState = async (dirty: boolean) => {
  if (!draftSession || lifecycleDisposed) return
  if (draftSequence >= 0xffffffff) throw new Error('窗口状态序号已耗尽，请保留草稿并重新打开窗口')
  await sendDraftReport({ session: draftSession, sequence: ++draftSequence, dirty })
}
watch([hasUnsavedChanges, windowDraftActivity], ([dirty]) => {
  if (appWindow && lifecycleReady) void reportDraftState(dirty).catch(error => {
    routeErrorMessage.value = `无法同步未保存状态：${String(error)}`
  })
}, { immediate: true, flush: 'sync' })

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('keydown', handlePaletteKeydown, true)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('longedit:open-command-palette', openCommandPalette)
  window.addEventListener('beforeunload', handleBeforeUnload)
  try {
    if (appWindow) {
      draftSession = await invoke<string>('register_window_draft_session')
      const stopMoveProtect = await appWindow.listen<{ requestId: string; paths: string[]; rewritePaths?: string[]; sourcePaths?: string[] }>('file-move-protect', event => {
        void moveProtection.protect(event.payload).catch(error => console.warn('文件整理窗口确认未接受', error))
      })
      const stopMoveRelease = await appWindow.listen<{ requestId: string; notice?: FileMoveNotice | null }>('file-move-release', event => {
        void moveProtection.release(event.payload).catch(error => console.warn('文件已移动，列表可稍后刷新', error))
      })
      if (lifecycleDisposed) { stopMoveProtect(); stopMoveRelease() }
      else lifecycleUnlisteners.push(stopMoveProtect, stopMoveRelease)
      const stopArchiveConfirmation = await appWindow.listen<string>('archive-confirm-window-state', event => {
        if (!draftSession || lifecycleDisposed) return
        // Read current state at request time. No save, discard, navigation or focus.
        // In-flight reports have higher local sequences and are rejected by native
        // state until acknowledged, rather than treating cached clean as consent.
        void invoke('reply_archive_window_confirmation', {
          requestId: event.payload, session: draftSession, sequence: draftSequence,
          ready: lifecycleReady, dirty: hasUnsavedChanges.value,
        }).catch(error => console.warn('归档窗口确认未接受，需重新预检', error))
      })
      if (lifecycleDisposed) stopArchiveConfirmation()
      else lifecycleUnlisteners.push(stopArchiveConfirmation)
      if (isMainWindow) {
        const unlisten = await appWindow.listen<{ requestId: string; path: string; libraryRoot: string; expiresAt: number }>('quick-note-open', async event => {
          const { requestId, path, libraryRoot, expiresAt } = event.payload
          let error: string | undefined
          try {
            const validateRequest = () => {
              if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) throw new Error('打开请求已过期，已保存文件仍保留，请重新打开')
              if (libraryRoot !== store.activeLibraryPath) throw new Error('文件已存入所选资料库。请先在主窗口切换到该库后打开，当前工作区未被切换')
            }
            validateRequest()
            await invoke('read_markdown_file', { libraryRoot, path })
            // Reading can outlive the request or a user-initiated library switch.
            validateRequest()
            const failure = await openManagedFile(router, path)
            if (failure) throw new Error('主窗口未完成导航，已保存文件仍保留')
            await appWindow?.show()
            await appWindow?.setFocus()
          } catch (cause) { error = String(cause) }
          await emitTo('quick-note', 'quick-note-open-result', { requestId, error }).catch(cause => {
            console.warn('快速笔记窗口已不可接收打开回执', cause)
          })
        })
        if (lifecycleDisposed) unlisten()
        else lifecycleUnlisteners.push(unlisten)
      }
      for (const [event, handler] of [['request-window-close', closeWindow], ['request-app-exit', handleExit]] as const) {
        const unlisten = await appWindow.listen(event, () => { void handler() })
        if (lifecycleDisposed) unlisten()
        else lifecycleUnlisteners.push(unlisten)
      }
    }
    await store.loadConfig().catch(error => { routeErrorMessage.value = `读取设置失败：${String(error)}` })
    lifecycleReady = !lifecycleDisposed
    if (appWindow && lifecycleReady) await reportDraftState(hasUnsavedChanges.value)
  } catch (error) {
    routeErrorMessage.value = `初始化关闭保护失败，请重试启动：${String(error)}`
  }
})

onUnmounted(() => {
  moveProtection.dispose()
  lifecycleDisposed = true
  lifecycleReady = false
  lifecycleUnlisteners.splice(0).forEach(unlisten => unlisten())
  resolveDiscardConfirm(false)
  window.removeEventListener('keydown', handlePaletteKeydown, true)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('longedit:open-command-palette', openCommandPalette)
  window.removeEventListener('beforeunload', handleBeforeUnload)
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
.app-container[data-window-role="external"] .workspace-tabs { display: none !important; }

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

.app-content { flex: 1; min-height: 0; display: flex; position: relative; overflow: hidden; }
.app-route-content { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; }
.route-error-notice {
  position: absolute;
  z-index: 3000;
  bottom: 12px;
  right: 12px;
  width: min(380px, calc(100% - 24px));
  max-height: 35vh;
  overflow: auto;
  overflow-wrap: anywhere;
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
