<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-dialog-provider>
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }" :data-theme="currentThemeName">
        <div class="custom-titlebar" v-if="showMainTitlebar" data-tauri-drag-region>
          <div class="titlebar-left" data-tauri-drag-region>
            <div class="app-logo">胧</div>
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
            <transition name="premium-switch" mode="out-in">
              <div :key="$route.path" class="route-wrapper">
                <component :is="Component" />
              </div>
            </transition>
          </router-view>
          <transition name="page-loader-fade">
            <div v-if="routeLoading" class="page-loader" role="status" aria-live="polite">
              <div class="page-loader-mark" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <div class="page-loader-copy">
                <strong>{{ routeLoadingLabel }}</strong>
                <span>正在准备页面内容...</span>
              </div>
            </div>
          </transition>
        </div>
        <CommandPalette :show="showPalette" @close="showPalette = false" @execute="handleCommand" />

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
import { useAppStore } from './store/app'
import { isExternallyEditable, routeForFile } from './config/fileFormats'
import { getThemeTone, isDarkTheme, resolveThemeName } from './config/themePresets'

const osTheme = useOsTheme()
const router = useRouter()
const store = useAppStore()

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
    bodyColor: 'transparent',
    cardColor: currentThemeTone.value.ui.surface,
    modalColor: currentThemeTone.value.ui.surface,
  }
}))

const showPalette = ref(false)
const showExitModal = ref(false)
const dontAskAgain = ref(false)
const routeLoading = ref(true)
const routeLoadingLabel = ref('正在打开知识库')
let unlistenOpenFile: (() => void) | null = null
let routeLoadingTimer: ReturnType<typeof setTimeout> | null = null
let routeLoadingStartedAt = performance.now()

const getRouteLoadingLabel = (routeName: unknown) => {
  const labels: Record<string, string> = {
    WorkspaceHome: '正在准备工作台',
    LibraryMode: '正在打开知识库',
    TextEditor: '正在打开文本编辑器',
    JsonEditor: '正在打开 JSON 工作区',
    YamlEditor: '正在打开 YAML 工作区',
    TempMode: '正在载入文档',
    QuickNote: '正在打开快速笔记',
    Graph: '正在准备知识图谱',
    Canvas: '正在打开知识画布',
    Pdf: '正在打开 PDF',
    Table: '正在打开数据表',
    Workbook: '正在解析 XLSX 工作簿',
    Diagram: '正在打开 Mermaid 图表工作室',
    MindMap: '正在打开 OPML 思维导图',
    Settings: '正在载入设置'
  }
  return labels[String(routeName)] || '正在切换页面'
}

const startRouteLoading = (routeName?: unknown) => {
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
  routeLoadingStartedAt = performance.now()
  routeLoadingLabel.value = getRouteLoadingLabel(routeName)
  routeLoading.value = true
}

const finishRouteLoading = () => {
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
  const remaining = Math.max(0, 420 - (performance.now() - routeLoadingStartedAt))
  routeLoadingTimer = setTimeout(() => { routeLoading.value = false }, remaining)
}

const removeBeforeEach = router.beforeEach((to) => {
  startRouteLoading(to.name)
  return true
})
const removeAfterEach = router.afterEach(() => {
  // Give the destination component two paint frames before revealing it.
  requestAnimationFrame(() => requestAnimationFrame(finishRouteLoading))
})

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); showPalette.value = true }
  if (e.key === 'F11') { e.preventDefault(); store.toggleZen() }
}

const routeExternalFile = async (filePath: string) => {
  const cleanPath = filePath.replace(/^"|"$/g, '')
  const target = routeForFile(cleanPath)
  if (target?.name === 'TextEditor') {
    await router.push({
      name: 'TextEditor',
      query: { path: cleanPath, external: '1', t: Date.now() },
    })
    return
  }
  await router.push({ name: 'TempMode', query: { path: cleanPath, t: Date.now() } })
}

const openExternalFile = async () => {
  const filePath = await invoke<string | null>('pick_external_editable_file')
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
    if (target) router.push(target)
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

onMounted(async () => {
  await store.loadConfig()

  unlistenOpenFile = await listen<string>('open-file', async (event) => {
    const filePath = event.payload
    if (isExternallyEditable(filePath)) {
      await routeExternalFile(filePath)
    }
  })

  try {
    const args = await invoke<string[]>('get_launch_args')
    const filePath = args.find(arg => isExternallyEditable(arg.replace(/^"|"$/g, '')))
    if (filePath) {
      await routeExternalFile(filePath)
    }
  } catch (_) { /* launch args unavailable, not critical */ }

  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  finishRouteLoading()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (unlistenOpenFile) unlistenOpenFile()
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
  removeBeforeEach()
  removeAfterEach()
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
.app-logo { font-size: 13px; font-weight: 700; color: var(--theme-primary); margin-right: 10px; }
.titlebar-title { font-size: 11px; font-weight: 500; opacity: 0.5; }

.titlebar-right, .window-controls { display: flex; height: 100%; }
.win-btn { width: 44px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: default; transition: all 0.2s ease; color: currentColor; }
.win-btn:hover { background: rgba(0, 0, 0, 0.05); }
body[data-theme="dark"] .win-btn:hover, body[data-theme="contrast"] .win-btn:hover { background: rgba(255, 255, 255, 0.1); }
.win-btn.close:hover { background: #ff3b30 !important; color: #fff !important; }

.app-content { flex: 1; position: relative; overflow: hidden; }

.page-loader {
  position: absolute;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background:
    radial-gradient(circle at 50% 45%, rgba(var(--theme-primary-rgb), 0.1), transparent 32%),
    color-mix(in srgb, var(--theme-bg) 90%, transparent);
  backdrop-filter: blur(10px);
}

.page-loader-mark {
  position: relative;
  width: 58px;
  height: 58px;
}

.page-loader-mark::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 16px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.2);
  background: rgba(var(--theme-primary-rgb), 0.055);
  transform: rotate(45deg);
  animation: loaderTile 1.8s var(--ease-premium) infinite;
}

.page-loader-mark span {
  position: absolute;
  top: 25px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--theme-primary);
  box-shadow: 0 0 14px rgba(var(--theme-primary-rgb), 0.45);
  animation: loaderDot 1.1s ease-in-out infinite;
}

.page-loader-mark span:nth-child(1) { left: 12px; }
.page-loader-mark span:nth-child(2) { left: 25px; animation-delay: 0.14s; }
.page-loader-mark span:nth-child(3) { left: 38px; animation-delay: 0.28s; }

.page-loader-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.page-loader-copy strong {
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 700;
}

.page-loader-copy span {
  color: var(--text-secondary);
  font-size: 11px;
}

.page-loader-fade-enter-active,
.page-loader-fade-leave-active {
  transition: opacity 0.25s ease, backdrop-filter 0.25s ease;
}

.page-loader-fade-enter-from,
.page-loader-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
}

@keyframes loaderTile {
  0%, 100% { transform: rotate(45deg) scale(0.92); opacity: 0.65; }
  50% { transform: rotate(135deg) scale(1.05); opacity: 1; }
}

@keyframes loaderDot {
  0%, 100% { transform: translateY(4px) scale(0.75); opacity: 0.45; }
  50% { transform: translateY(-4px) scale(1); opacity: 1; }
}

/* 全局高级转场动效 */
.route-wrapper {
  width: 100%;
  height: 100%;
}

.premium-switch-enter-active, .premium-switch-leave-active {
  transition:
    opacity var(--motion-page) var(--ease-standard),
    transform var(--motion-page) var(--ease-emphasized),
    filter var(--motion-page) var(--ease-standard);
}
.premium-switch-enter-from { opacity: 0; transform: scale(0.96) translateY(15px); filter: blur(10px); }
.premium-switch-leave-to { opacity: 0; transform: scale(1.04); filter: blur(5px); }

.premium-switch-leave-active {
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.premium-switch-enter-active {
  position: relative;
  z-index: 2;
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
</style>
