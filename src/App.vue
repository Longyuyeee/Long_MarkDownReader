<template>
  <n-config-provider :theme="activeTheme" :theme-overrides="themeOverrides">
    <n-message-provider :placement="'top'" :container-style="{ marginTop: '40px' }">
      <div class="app-container" :class="{ 'is-dark': isDark, 'zen-mode': store.isZen }">
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
import { computed, onMounted, ref } from 'vue'
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

const themeOverrides: GlobalThemeOverrides = {
  common: {
    borderRadius: '8px',
    primaryColor: '#667eea',
    primaryColorHover: '#764ba2',
  }
}

const showPalette = ref(false)

const handleCommand = (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'zen-mode') store.toggleZen()
    if (item.action === 'theme-light') store.theme = 'light'
    if (item.action === 'theme-dark') store.theme = 'dark'
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
  store.libraryPath = config.library_path
  store.theme = config.theme

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
:root { --titlebar-height: 34px; }
body { margin: 0; padding: 0; overflow: hidden; font-family: "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei", sans-serif; background: transparent; transition: background-color 0.3s ease; }
.app-container { height: 100vh; display: flex; flex-direction: column; background: transparent; color: #333; transition: color 0.3s ease; }
.app-container.is-dark { color: #eee; background-color: rgba(20, 20, 20, 0.1); }
.custom-titlebar { height: var(--titlebar-height); display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); user-select: none; z-index: 9999; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.is-dark .custom-titlebar { background: rgba(0, 0, 0, 0.15); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.titlebar-left { display: flex; align-items: center; padding-left: 12px; flex: 1; height: 100%; }
.app-logo { font-size: 14px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-right: 8px; }
.titlebar-title { font-size: 12px; opacity: 0.7; }
.titlebar-right { display: flex; height: 100%; }
.window-controls { display: flex; height: 100%; }
.win-btn { width: 46px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: default; transition: background 0.2s, color 0.2s; color: currentColor; }
.win-btn:hover { background: rgba(0, 0, 0, 0.1); }
.is-dark .win-btn:hover { background: rgba(255, 255, 255, 0.1); }
.win-btn.close:hover { background: #e81123 !important; color: #fff !important; }
.app-content { flex: 1; position: relative; overflow: hidden; }
.zen-mode .app-content { background: transparent; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 10px; }
.is-dark ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }
</style>
