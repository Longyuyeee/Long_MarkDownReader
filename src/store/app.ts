import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'

export type SessionMode = 'TEMP' | 'LIBRARY'

export const THEME_MAP: Record<string, string> = {
  white: '#ffffff',
  green: '#f0f9eb',
  blue: '#f0f7ff',
  pink: '#fff5f7',
  dark: '#1c1c1e',
  system: '#ffffff'
}

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
  content?: string
}

export interface LibraryConfig {
  name: string
  path: string
}

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as 'white' | 'dark' | 'system' | 'green' | 'blue' | 'pink',
    codeTheme: 'github' as string,
    editorMode: 'wysiwyg' as 'wysiwyg' | 'ir' | 'sv',
    editorBgColor: '' as string,
    heroIcon: 'BookOpen' as string,
    libraries: [] as LibraryConfig[],
    activeLibraryPath: '',
    autoSaveInterval: 3,
    maxHistoryCount: 10,
    isAutostart: false,
    isDefaultEditor: false,
    exitStrategy: 'ask' as 'ask' | 'quit' | 'minimize',
    isZen: false,
  }),
  getters: {
    libraryPath: (state) => state.activeLibraryPath,
    currentLibraryName: (state) => {
      const lib = state.libraries.find(l => l.path === state.activeLibraryPath)
      return lib ? lib.name : '未关联文件库'
    }
  },
  actions: {
    async loadConfig() {
      try {
        const config = await invoke<any>('get_config')
        this.libraries = config.libraries || []
        this.activeLibraryPath = config.activeLibraryPath || ''
        this.theme = config.theme || 'system'
        this.codeTheme = config.codeTheme || 'github'
        this.editorMode = config.editorMode || 'wysiwyg'
        this.editorBgColor = config.editorBgColor || ''
        this.heroIcon = config.heroIcon || 'BookOpen'
        this.autoSaveInterval = config.autoSaveInterval || 3
        this.maxHistoryCount = config.maxHistoryCount || 10
        this.exitStrategy = config.exitStrategy || 'ask'

        // 同步系统真实的自启状态，以系统为准
        try {
          this.isAutostart = await isEnabled()
        } catch (e) {
          this.isAutostart = config.isAutostart || false
        }
        
        // 校准系统默认关联状态
        await this.checkSystemStatus()
      } catch (e) { console.error('Failed to load config', e) }
    },
    async checkSystemStatus() {
      try {
        this.isDefaultEditor = await invoke<boolean>('check_association_status')
      } catch (e) {
        console.error('Failed to check association status', e)
      }
    },
    async updateConfig(patch: any) {
      // 检测文件库切换，若切换则清空标签页
      if (patch.activeLibraryPath !== undefined && patch.activeLibraryPath !== this.activeLibraryPath) {
        this.tabs = []
        this.activeTabId = null
      }

      // 核心修复：真实调用自启插件
      if (patch.isAutostart !== undefined && patch.isAutostart !== this.isAutostart) {
        try {
          if (patch.isAutostart) await enable()
          else await disable()
        } catch (e) {
          console.error('Autostart plugin error', e)
          patch.isAutostart = this.isAutostart // 如果操作失败，回滚 patch 值
        }
      }

      for (const key in patch) {
        if (patch[key] !== undefined) {
          (this as any)[key] = patch[key]
        }
      }
      
      await invoke('save_config', { config: {
        libraries: this.libraries,
        activeLibraryPath: this.activeLibraryPath,
        theme: this.theme,
        codeTheme: this.codeTheme,
        editorMode: this.editorMode,
        editorBgColor: this.editorBgColor,
        heroIcon: this.heroIcon,
        autoSaveInterval: this.autoSaveInterval,
        maxHistoryCount: this.maxHistoryCount,
        isAutostart: this.isAutostart,
        exitStrategy: this.exitStrategy
      } })

    },
    addTab(tab: TabInfo) {
      const idx = this.tabs.findIndex(t => t.path === tab.path)
      if (idx > -1) {
        const existing = this.tabs[idx]
        if (tab.content) existing.content = tab.content
        const [removed] = this.tabs.splice(idx, 1)
        this.tabs.unshift(removed)
        if (this.activeTabId !== existing.id) {
          this.activeTabId = existing.id
        }
      } else {
        this.tabs.unshift(tab)
        this.activeTabId = tab.id
      }
    },
    updateTabContent(path: string, content: string) {
      const tab = this.tabs.find(t => t.path === path)
      if (tab) tab.content = content
    },
    removeTab(tabId: string) {
      this.tabs = this.tabs.filter(t => t.id !== tabId)
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null
      }
    },
    toggleZen() {
      this.isZen = !this.isZen
    }
  }
})
