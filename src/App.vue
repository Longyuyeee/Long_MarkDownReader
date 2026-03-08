<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }" :data-theme="currentThemeName">
        <div class="custom-titlebar" v-if="showMainTitlebar" data-tauri-drag-region>
          <div class="titlebar-left" data-tauri-drag-region>
            <div class="app-logo">胧</div>
            <div class="titlebar-title">胧编辑</div>
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
            <transition name="premium-switch">
              <component :is="Component" />
            </transition>
          </router-view>
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
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { darkTheme, useOsTheme, GlobalThemeOverrides } from 'naive-ui'
import { Window } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { listen } from '@tauri-apps/api/event'
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
    borderRadius: '8px',
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

const handleCommand = (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'zen-mode') store.toggleZen()
    if (item.action.startsWith('theme-')) store.theme = item.action.replace('theme-', '') as any
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
const closeWindow = () => { 
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

  await listen<string>('open-file', async (event) => {
    const filePath = event.payload
    
    // 唤醒窗口
    const win = new Window('main')
    if (await win.isMinimized()) await win.unminimize()
    await win.show()
    await win.setFocus()

    if (filePath.endsWith('.md')) {
      router.push({ name: 'TempMode', query: { path: filePath, t: Date.now() } })
    }
  })

  try {
    const args = await invoke<string[]>('get_launch_args')
    const filePath = args.find(arg => arg.endsWith('.md'))
    if (filePath) router.push({ name: 'TempMode', query: { path: filePath } })
  } catch (e) {}

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); showPalette.value = true }
    if (e.key === 'F11') { e.preventDefault(); store.toggleZen() }
  })
})
</script>

<style>
/* 全局变量：定义在 body 级别以确保覆盖所有子模块 */
body[data-theme="white"] { --theme-bg: #ffffff; --theme-primary: #007aff; --theme-card: rgba(0,0,0,0.03); --theme-text: #1d1d1f; }
body[data-theme="green"] { --theme-bg: #f2f9f1; --theme-primary: #42b883; --theme-card: rgba(66,184,131,0.06); --theme-text: #1d1d1f; }
body[data-theme="blue"]  { --theme-bg: #f0f7ff; --theme-primary: #00a2ff; --theme-card: rgba(0,162,255,0.06); --theme-text: #1d1d1f; }
body[data-theme="pink"]  { --theme-bg: #fff5f8; --theme-primary: #ff6b9d; --theme-card: rgba(255,107,157,0.06); --theme-text: #1d1d1f; }
body[data-theme="dark"]  { --theme-bg: #1c1c1e; --theme-primary: #42b883; --theme-card: rgba(255,255,255,0.08); --theme-text: #f5f5f7; }

body { 
  --titlebar-height: 32px;
  margin: 0; 
  padding: 0; 
  overflow: hidden; 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif; 
  background-color: var(--theme-bg) !important; 
  color: var(--theme-text);
  transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease; 
}

.app-container { height: 100vh; display: flex; flex-direction: column; background: transparent; position: relative; }

/* 退出弹窗样式 */
.exit-modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
}
.exit-modal-card {
  background: var(--theme-bg);
  padding: 24px; border-radius: 16px; width: 360px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
}
.modal-header { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.modal-body { font-size: 14px; opacity: 0.8; margin-bottom: 24px; }
.modal-checkbox { margin-bottom: 24px; display: flex; justify-content: center; }
.modal-footer { display: flex; gap: 8px; justify-content: center; }

.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.95); }

.custom-titlebar { 
  height: var(--titlebar-height); 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  background: var(--theme-bg); 
  backdrop-filter: saturate(180%) blur(20px); 
  opacity: 0.98;
  user-select: none; 
  z-index: 9999; 
  border-bottom: 1px solid rgba(0, 0, 0, 0.05); 
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

/* 全局高级转场动效 */
.premium-switch-enter-active, .premium-switch-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: absolute; width: 100%;
}
.premium-switch-enter-from { opacity: 0; transform: scale(0.96) translateY(15px); filter: blur(10px); }
.premium-switch-leave-to { opacity: 0; transform: scale(1.04); filter: blur(5px); }

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