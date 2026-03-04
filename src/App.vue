<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }" :data-theme="currentThemeName">
        <div class="custom-titlebar" v-if="!store.isZen" data-tauri-drag-region>
          <div class="titlebar-left" data-tauri-drag-region>
            <div class="app-logo">胧</div>
            <div class="titlebar-title">胧编辑·md助手</div>
          </div>
          <div class="titlebar-right">
            <div class="window-controls">
              <div class="control win-btn minimize" @click="minimizeWindow"><svg width="10" height="1"><rect width="10" height="1" fill="currentColor"/></svg></div>
              <div class="control win-btn maximize" @click="maximizeWindow"><svg width="10" height="10"><path d="M0,0v10h10V0H0z M9,9H1V1h8V9z" fill="currentColor"/></svg></div>
              <div class="control win-btn close" @click="closeWindow"><svg width="10" height="10"><path d="M10,0.7L9.3,0L5,4.3L0.7,0L0,0.7L4.3,5L0,9.3L0.7,10L5,5.7L9.3,10L10,9.3L5.7,5L10,0.7z" fill="currentColor"/></svg></div>
            </div>
          </div>
        </div>
        <div class="app-content"><router-view /></div>
        <CommandPalette :show="showPalette" @close="showPalette = false" @execute="handleCommand" />
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

const handleCommand = (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'zen-mode') store.toggleZen()
    if (item.action.startsWith('theme-')) store.theme = item.action.replace('theme-', '') as any
    if (item.action === 'refresh') { /* 由页面处理 */ }
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
const closeWindow = () => appWindow.close()

onMounted(async () => {
  const config = await invoke<any>('get_config')
  store.libraryPath = config.libraryPath
  store.theme = config.theme || 'system'

  await listen<string>('open-file', (event) => {
    const filePath = event.payload
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
  margin: 0; 
  padding: 0; 
  overflow: hidden; 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif; 
  background-color: var(--theme-bg) !important; /* 强制背景跟随变量 */
  color: var(--theme-text);
  transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease; 
}

.app-container { 
  height: 100vh; 
  display: flex; 
  flex-direction: column; 
  background: transparent; 
}

/* 装饰性背景微调 */
body::before {
  content: "";
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at 50% 50%, var(--theme-card) 0%, transparent 100%);
  pointer-events: none;
  z-index: -1;
}

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

body[data-theme="dark"] .custom-titlebar { 
  border-bottom-color: rgba(255, 255, 255, 0.1); 
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

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: var(--theme-primary); 
  border-radius: 20px; 
  border: 3px solid transparent;
  background-clip: content-box;
  opacity: 0.4;
}
</style>