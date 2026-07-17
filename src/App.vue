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

const osTheme = useOsTheme()
const router = useRouter()
const store = useAppStore()

const isDark = computed(() => {
  if (store.theme === 'system') return osTheme.value === 'dark'
  return store.theme === 'dark'
})
const activeTheme = computed(() => (isDark.value ? darkTheme : null))

// 是否显示主窗口标题栏（排除快速笔记窗口）
const showMainTitlebar = computed(() => {
  return !store.isZen && router.currentRoute.value.name !== 'QuickNote'
})

const currentThemeName = computed(() => {
  if (store.theme === 'system') return osTheme.value === 'dark' ? 'dark' : 'white'
  return store.theme
})

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

// 计算主题色调
const themeColors = computed(() => {
  const themes: Record<string, any> = {
    white: { primary: '#007aff', bg: '#ffffff', card: 'rgba(0,0,0,0.03)' },
    green: { primary: '#42b883', bg: '#f2f9f1', card: 'rgba(66,184,131,0.06)' },
    blue:  { primary: '#00a2ff', bg: '#f0f7ff', card: 'rgba(0,162,255,0.06)' },
    pink:  { primary: '#ff6b9d', bg: '#fff5f8', card: 'rgba(255,107,157,0.06)' },
    dark:  { primary: '#42b883', bg: '#1c1c1e', card: 'rgba(255,255,255,0.08)' }
  }
  return themes[currentThemeName.value] || themes.white
})

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    borderRadius: getComputedStyle(document.body).getPropertyValue('--theme-radius-sm').trim() || '8px',
    borderRadiusSmall: getComputedStyle(document.body).getPropertyValue('--theme-radius-sm').trim() || '6px',
    primaryColor: themeColors.value.primary,
    primaryColorHover: themeColors.value.primary,
    bodyColor: 'transparent',
    cardColor: themeColors.value.bg,
    modalColor: themeColors.value.bg,
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
    LibraryMode: '正在打开知识库',
    TempMode: '正在载入文档',
    QuickNote: '正在打开快速笔记',
    Graph: '正在准备知识图谱',
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

const handleCommand = (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'zen-mode') store.toggleZen()
    else if (item.action === 'export-html') emit('command-export')
    else if (item.action === 'save-file') emit('command-save')
    else if (item.action === 'refresh') emit('command-refresh')
    else if (item.action === 'daily-note') emit('command-daily-note')
    else if (item.action.startsWith('theme-')) store.theme = item.action.replace('theme-', '') as any
  } else if (item.type === 'file') {
    router.push({ name: 'LibraryMode', query: { path: item.path } })
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
const handleHide = () => { 
  if (dontAskAgain.value) {
    store.updateConfig({ exitStrategy: 'minimize' })
  }
  showExitModal.value = false; 
  appWindow.hide() 
}
const handleExit = () => { 
  if (dontAskAgain.value) {
    store.updateConfig({ exitStrategy: 'quit' })
  }
  invoke('exit_app') 
}

onMounted(async () => {
  await store.loadConfig()

  unlistenOpenFile = await listen<string>('open-file', async (event) => {
    const filePath = event.payload
    if (filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().includes('.md"')) {
      const cleanPath = filePath.replace(/^"|"$/g, '')
      router.push({ name: 'TempMode', query: { path: cleanPath, t: Date.now() } })
    }
  })

  try {
    const args = await invoke<string[]>('get_launch_args')
    const filePath = args.find(arg => arg.toLowerCase().endsWith('.md') || arg.toLowerCase().includes('.md"'))
    if (filePath) {
      const cleanPath = filePath.replace(/^"|"$/g, '')
      router.push({ name: 'TempMode', query: { path: cleanPath } })
    }
  } catch (_) { /* launch args unavailable, not critical */ }

  window.addEventListener('keydown', handleGlobalKeydown)
  finishRouteLoading()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (unlistenOpenFile) unlistenOpenFile()
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
  removeBeforeEach()
  removeAfterEach()
})
</script>

<style>
/* 全局变量：定义在 body 级别以确保覆盖所有子模块 */
body[data-theme="white"] { --theme-bg: #ffffff; --theme-primary: #0071e3; --theme-card: rgba(0,0,0,0.025); --theme-text: #1d1d1f; --theme-bg-rgb: 255,255,255; }
body[data-theme="green"] { --theme-bg: #edf7f0; --theme-primary: #34c759; --theme-card: rgba(52,199,89,0.08); --theme-text: #1d1d1f; --theme-bg-rgb: 237,247,240; }
body[data-theme="blue"]  { --theme-bg: #eef5ff; --theme-primary: #0a84ff; --theme-card: rgba(10,132,255,0.07); --theme-text: #1d1d1f; --theme-bg-rgb: 238,245,255; }
body[data-theme="pink"]  { --theme-bg: #fff0f5; --theme-primary: #ff375f; --theme-card: rgba(255,55,95,0.07); --theme-text: #1d1d1f; --theme-bg-rgb: 255,240,245; }
body[data-theme="dark"]  { --theme-bg: #161618; --theme-primary: #30d158; --theme-card: rgba(255,255,255,0.06); --theme-text: #f5f5f7; --theme-bg-rgb: 22,22,24; }

/* --theme-primary-rgb (从 hex 提取 RGB 分量) */
body[data-theme="white"] { --theme-primary-rgb: 0,113,227; }
body[data-theme="green"] { --theme-primary-rgb: 52,199,89; }
body[data-theme="blue"]  { --theme-primary-rgb: 10,132,255; }
body[data-theme="pink"]  { --theme-primary-rgb: 255,55,95; }
body[data-theme="dark"]  { --theme-primary-rgb: 48,209,88; }

/* 视觉风格 — 通过 CSS 变量覆盖全局组件样式 */
body[data-style="soft"] {
  --theme-radius: 10px; --theme-radius-sm: 6px;
  --theme-shadow: 0 1px 4px rgba(0,0,0,0.06); --theme-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --theme-glass: none; --theme-border: 1px solid rgba(0,0,0,0.05);
  --theme-spacing: 1; --theme-font: inherit;
}
body[data-style="neo"] {
  --theme-radius: 16px; --theme-radius-sm: 12px;
  --theme-shadow: 6px 6px 12px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.7);
  --theme-shadow-sm: 3px 3px 6px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.6);
  --theme-glass: none; --theme-border: none;
  --theme-spacing: 1.05; --theme-font: inherit;
}
body[data-style="glass"] {
  --theme-radius: 18px; --theme-radius-sm: 12px;
  --theme-shadow: 0 8px 32px rgba(0,0,0,0.1); --theme-shadow-sm: 0 4px 12px rgba(0,0,0,0.06);
  --theme-glass: saturate(180%) blur(30px); --theme-border: 1px solid rgba(255,255,255,0.15);
  --theme-spacing: 1.15; --theme-font: inherit;
}
body[data-style="airy"] {
  --theme-radius: 12px; --theme-radius-sm: 8px;
  --theme-shadow: 0 4px 24px rgba(0,0,0,0.05); --theme-shadow-sm: 0 2px 8px rgba(0,0,0,0.03);
  --theme-glass: none; --theme-border: 1px solid rgba(0,0,0,0.03);
  --theme-spacing: 1.6; --theme-font: inherit;
}
body[data-style="minimal"] {
  --theme-radius: 4px; --theme-radius-sm: 2px;
  --theme-shadow: none; --theme-shadow-sm: none;
  --theme-glass: none; --theme-border: none;
  --theme-spacing: 0.8; --theme-font: inherit;
}
body[data-style="sharp"] {
  --theme-radius: 0px; --theme-radius-sm: 0px;
  --theme-shadow: 3px 3px 0 rgba(0,0,0,0.08); --theme-shadow-sm: 2px 2px 0 rgba(0,0,0,0.05);
  --theme-glass: none; --theme-border: 2px solid rgba(0,0,0,0.12);
  --theme-spacing: 0.7; --theme-font: inherit;
}
body[data-theme="dark"][data-style="neo"] {
  --theme-shadow: 6px 6px 12px rgba(0,0,0,0.5), -4px -4px 12px rgba(255,255,255,0.04);
  --theme-shadow-sm: 3px 3px 6px rgba(0,0,0,0.35), -2px -2px 6px rgba(255,255,255,0.03);
}
body[data-theme="dark"][data-style="glass"] {
  --theme-border: 1px solid rgba(255,255,255,0.1);
}
body[data-theme="dark"][data-style="sharp"] {
  --theme-shadow: 3px 3px 0 rgba(0,0,0,0.5); --theme-shadow-sm: 2px 2px 0 rgba(0,0,0,0.3);
  --theme-border: 2px solid rgba(255,255,255,0.15);
}

/* Typography scale */
body { --text-xs: 10px; --text-sm: 12px; --text-base: 13px; --text-md: 14px; --text-lg: 16px; --text-xl: 20px; --text-2xl: 28px; }
/* Text color hierarchy */
body { --text-secondary: rgba(29, 29, 31, 0.55); --text-tertiary: rgba(29, 29, 31, 0.35); }
body[data-theme="dark"] { --text-secondary: rgba(245, 245, 247, 0.55); --text-tertiary: rgba(245, 245, 247, 0.35); }
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
body[data-theme="dark"] .win-btn:hover { background: rgba(255, 255, 255, 0.1); }
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
